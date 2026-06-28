import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Logger } from "../utils/log.js";
import type {
  PlatformAdapter,
  PlatformType,
  ParsedRepoUrl,
  ForkResult,
  CreatePrParams,
  CreatePrResult,
  PrStatus,
} from "./types.js";

/**
 * GitHub 平台适配器。
 * 
 * URL 格式: https://github.com/owner/repo 或 https://github.com/owner/repo.git
 * 前置条件: gh CLI 已安装并登录
 * Fork/PR: 依赖 gh CLI
 */
export class GitHubAdapter implements PlatformAdapter {
  readonly type: PlatformType = "github";
  readonly displayName = "GitHub";

  private _ghExe: string | null = null;

  /**
   * 查找 gh 可执行文件路径（仅计算一次）。
   * 先尝试 PATH，再搜 Windows 常见安装位置。
   */
  private getGhExe(): string {
    if (this._ghExe) return this._ghExe;

    // 如果 PATH 里已有，直接用 "gh"
    try {
      execSync("gh --version", { stdio: "pipe" });
      this._ghExe = "gh";
      return "gh";
    } catch {
      // 不在 PATH，搜 Windows 常见路径
    }

    const candidates = [
      "C:\\Program Files\\GitHub CLI\\gh.exe",
      "C:\\Program Files (x86)\\GitHub CLI\\gh.exe",
      `${process.env.LOCALAPPDATA}\\Programs\\GitHub CLI\\gh.exe`,
    ];

    for (const p of candidates) {
      if (existsSync(p)) {
        this._ghExe = p;
        return p;
      }
    }

    this._ghExe = "gh"; // 回退，后面会抛错
    return "gh";
  }

  /**
   * 执行 gh 命令。
   */
  private gh(cmd: string, opts: Parameters<typeof execSync>[1] = {}): string {
    const bin = this.getGhExe();
    const fullCmd = bin === "gh" ? cmd : cmd.replace(/^gh/, `"${bin}"`);
    return execSync(fullCmd, { encoding: "utf-8", ...opts }) as string;
  }

  parseRepoUrl(url: string): ParsedRepoUrl | null {
    // HTTPS: https://github.com/owner/repo 或 https://github.com/owner/repo.git
    let match = url.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    );
    // SSH: git@github.com:owner/repo.git
    if (!match) {
      match = url.match(
        /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
      );
    }
    if (!match) return null;
    return {
      platform: "github",
      owner: match[1],
      name: match[2],
      originalUrl: url,
    };
  }

  checkPrerequisites(log: Logger): void {
    try {
      this.gh("gh --version", { stdio: "pipe" });
      log.verbose("gh CLI 可用");
    } catch {
      throw new Error(
        "未找到 GitHub CLI (gh)。请安装: https://cli.github.com\n" +
          "或使用 --dry-run 模式。",
      );
    }

    try {
      this.gh("gh auth status", { stdio: "pipe" });
      log.verbose("gh 已登录");
    } catch {
      throw new Error("gh CLI 未登录。请运行: gh auth login");
    }
  }

  async forkRepo(owner: string, repo: string, log: Logger): Promise<ForkResult> {
    log.info(`正在 Fork ${owner}/${repo} ...`);

    const cmd = `gh repo fork ${owner}/${repo} --clone=false --fork-name ${repo}`;
    log.verbose(cmd);

    const stdout = this.gh(cmd, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 60_000,
    });

    const match = stdout.match(
      /(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\s|$)/,
    );

    if (!match) {
      try {
        const user = this.gh("gh api user --jq .login", {
          encoding: "utf-8",
          stdio: "pipe",
        }).trim();
        log.info(`Fork 完成: ${user}/${repo}`);
        return { forkUrl: `https://github.com/${user}/${repo}.git`, forkOwner: user };
      } catch {
        throw new Error(`无法解析 Fork 结果: ${stdout.trim()}`);
      }
    }

    const forkOwner = match[1];
    log.info(`Fork 完成: ${forkOwner}/${repo}`);
    return { forkUrl: `https://github.com/${forkOwner}/${repo}.git`, forkOwner };
  }

  async createDraftPr(
    params: CreatePrParams,
    log: Logger,
  ): Promise<CreatePrResult> {
    const { targetOwner, targetRepo, baseBranch, headUser, headBranch, title, body } = params;

    log.info(`正在创建 Draft PR 到 ${targetOwner}/${targetRepo} ...`);

    const titleEscaped = title.replace(/"/g, '\\"');
    const bodyEscaped = body.replace(/"/g, '\\"').replace(/\n/g, "\\n");

    const cmd =
      `gh pr create ` +
      `--repo ${targetOwner}/${targetRepo} ` +
      `--base ${baseBranch} ` +
      `--head ${headUser}:${headBranch} ` +
      `--title "${titleEscaped}" ` +
      `--body "${bodyEscaped}" ` +
      `--draft`;

    log.verbose(cmd);

    const stdout = this.gh(cmd, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 30_000,
    }).trim();

    const urlMatch = stdout.match(
      /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/,
    );
    if (!urlMatch) {
      throw new Error(`无法解析 PR URL: ${stdout}`);
    }

    log.info(`PR 已创建: ${urlMatch[0]}`);
    return { prUrl: urlMatch[0], prNumber: parseInt(urlMatch[1], 10) };
  }

  async viewPr(prUrl: string, log: Logger): Promise<PrStatus> {
    log.verbose(`查询 PR 状态: ${prUrl}`);

    const stdout = this.gh(
      `gh pr view "${prUrl}" --json state,mergedAt,closedAt`,
      { encoding: "utf-8", stdio: "pipe" },
    ).trim();

    return JSON.parse(stdout) as PrStatus;
  }
}
