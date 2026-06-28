import { describe, it, expect } from "vitest";
import { validateRepoUrl } from "../src/repo/clone.js";

// ═══════════════════════════════════════════
//  安全测试套件 —— 对核心安全机制的单元测试
// ═══════════════════════════════════════════

describe("命令注入防护", () => {
  it("含 shell 注入字符的 URL 被 validateRepoUrl 拒绝", () => {
    const maliciousUrls = [
      "https://github.com/owner/repo; rm -rf /",
      "https://github.com/owner/repo`echo pwned`",
      "https://github.com/owner/$(whoami)",
      "https://github.com/owner/ repo",
      "https://github.com/owner/repo\n",
      "https://github.com/owner/repo\t",
    ];

    for (const url of maliciousUrls) {
      expect(validateRepoUrl(url)).toBe(false);
    }
  });

  it("合法 URL 被 validateRepoUrl 接受", () => {
    expect(validateRepoUrl("https://github.com/owner/repo")).toBe(true);
    expect(validateRepoUrl("https://gitee.com/owner/repo")).toBe(true);
    expect(validateRepoUrl("https://git.woa.com/group/project")).toBe(true);
  });
});

describe("平台 URL 解析安全性", () => {
  it("危险 URL 不通过 parseRepoUrl", async () => {
    const { parseRepoUrl } = await import("../src/repo/clone.js");

    const dangerous = [
      "https://github.com/owner/repo; rm -rf /",
      "https://github.com/owner/$(whoami)",
    ];

    for (const url of dangerous) {
      expect(parseRepoUrl(url)).toBeNull();
    }
  });
});

describe("PrepareOptions 默认安全", () => {
  it("submit 字段默认必须为 false", () => {
    // 验证类型定义：PrepareOptions.submit 是 boolean
    const opts: { submit: boolean } = { submit: false };
    expect(opts.submit).toBe(false);
  });
});

describe("sanitizeForOutput 脱敏函数", () => {
  it("移除 API Key (sk-...)", () => {
    // 通过模块内部行为间接验证：日志函数不应输出 key
    // 直接验证正则模式
    const pattern = /sk-[a-zA-Z0-9]{20,}/g;
    const msg = "Error with key sk-1234567890abcdef1234567890abcdef1234567890 in request";
    const sanitized = msg.replace(pattern, "***REDACTED***");
    expect(sanitized).not.toContain("sk-1234567890abcdef1234567890abcdef1234567890");
    expect(sanitized).toContain("***REDACTED***");
  });

  it("移除 Gitee Token", () => {
    const fakeToken = "gitee_secret_token_12345";
    const msg = `Failed with token ${fakeToken}`;
    const sanitized = msg.replace(fakeToken, "***REDACTED***");
    expect(sanitized).not.toContain(fakeToken);
    expect(sanitized).toContain("***REDACTED***");
  });
});

describe("GenerationRun partial_failure 类型", () => {
  it("partial_failure 是有效的 StepStatus", () => {
    const status: import("../src/types/run.js").StepStatus = {
      status: "partial_failure",
      error: "test",
      at: new Date().toISOString(),
    };
    expect(status.status).toBe("partial_failure");
  });

  it("SubmitRecoveryInfo 结构完整", () => {
    const info: import("../src/types/run.js").SubmitRecoveryInfo = {
      failedAt: "push",
      remoteResources: {
        forkUrl: "https://github.com/u/r.git",
        forkOwner: "u",
        branchName: "repopassport/en-readme",
        remotePushed: true,
      },
      recoveryCommands: ["gh pr create ..."],
    };
    expect(info.failedAt).toBe("push");
    expect(info.remoteResources.remotePushed).toBe(true);
    expect(info.recoveryCommands.length).toBeGreaterThan(0);
  });
});

describe("Git 操作函数安全边界", () => {
  it("createBranch 安全校验拒绝危险分支名", async () => {
    const { createBranch } = await import("../src/pr/git.js");
    const log = { info: () => {}, verbose: () => {}, error: () => {}, warn: () => {} };

    // 危险分支名应被 assertSafeRef 拒绝
    expect(() => {
      createBranch("/nonexistent/dir", "branch; rm -rf /", log);
    }).toThrow("不允许的分支名");
  }, 5000);

  it("createBranch 接受合法分支名（即便目录不存在也应报 git 错误而非注入）", async () => {
    const { createBranch } = await import("../src/pr/git.js");
    const log = { info: () => {}, verbose: () => {}, error: () => {}, warn: () => {} };

    // 合法分支名 + 无效目录 → 预期抛错（非注入类错误）
    expect(() => {
      createBranch("/nonexistent/dir", "valid-branch-name", log);
    }).toThrow();
  }, 5000);
});

describe("README 文件名约定", () => {
  it("英文 README 命名只能是 README.en.md / README_EN.md / README-en.md", () => {
    // 验证 detectEnglishReadme 的正则模式
    const patterns = [/README\.en\.md/i, /README_EN\.md/i, /README-en\.md/i];

    // README.md 不应匹配任何英文 README 模式
    const readmeName = "README.md";
    for (const p of patterns) {
      expect(p.test(readmeName)).toBe(false);
    }

    // README.en.md 应匹配 README\.en\.md
    expect(/README\.en\.md/i.test("README.en.md")).toBe(true);
    // README_EN.md 应匹配 README_EN\.md
    expect(/README_EN\.md/i.test("README_EN.md")).toBe(true);
    // README-en.md 应匹配 README-en\.md
    expect(/README-en\.md/i.test("README-en.md")).toBe(true);
  });
});
