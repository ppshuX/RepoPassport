import { describe, it, expect } from "vitest";
import { detectPlatform } from "../src/platform/index.js";

describe("status 命令 PR URL 格式验证", () => {
  it("验证 GitHub PR URL 格式", () => {
    const validUrls = [
      "https://github.com/owner/repo/pull/123",
      "https://github.com/nestjs/nest/pull/12345",
      "https://github.com/a/b/pull/1",
    ];

    const invalidUrls = [
      "https://github.com/owner/repo",
      "https://github.com/owner/repo/issues/123",
      "not-a-url",
      "https://gitlab.com/owner/repo/pull/123",
    ];

    const pattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

    for (const url of validUrls) {
      expect(pattern.test(url)).toBe(true);
    }

    for (const url of invalidUrls) {
      expect(pattern.test(url)).toBe(false);
    }
  });

  it("验证 Gitee PR URL 格式", () => {
    const pattern = /^https:\/\/gitee\.com\/[\w.-]+\/[\w.-]+\/pulls\/\d+/;
    expect(pattern.test("https://gitee.com/owner/repo/pulls/123")).toBe(true);
    expect(pattern.test("https://gitee.com/owner/repo")).toBe(false);
  });

  it("Gitee PR URL 被 detectPlatform 正确识别为 gitee", () => {
    const { adapter } = detectPlatform("https://gitee.com/owner/repo/pulls/123");
    expect(adapter.type).toBe("gitee");
  });

  it("GitHub PR URL 被 detectPlatform 正确识别为 github", () => {
    const { adapter } = detectPlatform("https://github.com/owner/repo/pull/123");
    expect(adapter.type).toBe("github");
  });
});
