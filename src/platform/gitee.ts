import { execSync } from "node:child_process";
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
 * Gitee（码云）平台适配器。
 *
 * URL 格式: https://gitee.com/owner/repo 或 https://gitee.com/owner/repo.git
 * 前置条件: GITEE_TOKEN 环境变量（个人访问令牌）
 * Fork/PR: 通过 Gitee OpenAPI v5（REST）
 *
 * Token 获取: https://gitee.com/profile/personal_access_tokens
 * 权限: projects, pull_requests
 */
export class GiteeAdapter implements PlatformAdapter {
  readonly type: PlatformType = "gitee";
  readonly displayName = "Gitee";

  private readonly apiBase = "https://gitee.com/api/v5";

  parseRepoUrl(url: string): ParsedRepoUrl | null {
    const match = url.match(
      /^https?:\/\/gitee\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    );
    if (!match) return null;
    return {
      platform: "gitee",
      owner: match[1],
      name: match[2],
      originalUrl: url,
    };
  }

  checkPrerequisites(log: Logger): void {
    const token = process.env["GITEE_TOKEN"];
    if (!token) {
      throw new Error(
        "未找到 GITEE_TOKEN 环境变量。\n" +
          "请设置: export GITEE_TOKEN=your_personal_access_token\n" +
          "Token 获取地址: https://gitee.com/profile/personal_access_tokens\n" +
          "所需权限: projects, pull_requests\n" +
          "或使用 --dry-run 模式。",
      );
    }
    log.verbose("GITEE_TOKEN 已配置");
  }

  async forkRepo(owner: string, repo: string, log: Logger): Promise<ForkResult> {
    log.info(`正在 Fork ${owner}/${repo} (Gitee)...`);

    const token = this.getToken();
    const url = `${this.apiBase}/repos/${owner}/${repo}/forks`;

    const stdout = this.apiPost(url, { access_token: token }, log);

    // Gitee API 返回 fork 后的仓库信息
    type GiteeRepo = { full_name: string; owner: { login: string } };
    const data = JSON.parse(stdout) as GiteeRepo;

    const forkOwner = data.owner.login;
    const forkUrl = `https://gitee.com/${data.full_name}.git`;

    log.info(`Fork 完成: ${data.full_name}`);
    return { forkUrl, forkOwner };
  }

  async createDraftPr(
    params: CreatePrParams,
    log: Logger,
  ): Promise<CreatePrResult> {
    const { targetOwner, targetRepo, baseBranch, headUser, headBranch, title, body } = params;

    log.info(`正在创建 PR 到 ${targetOwner}/${targetRepo} (Gitee)...`);

    const token = this.getToken();
    const url = `${this.apiBase}/repos/${targetOwner}/${targetRepo}/pulls`;

    const payload: Record<string, unknown> = {
      access_token: token,
      title,
      body,
      base: baseBranch,
      head: `${headUser}:${headBranch}`,
      draft: true,
    };

    const stdout = this.apiPost(url, payload, log);

    type GiteePr = { html_url: string; number: number };
    const data = JSON.parse(stdout) as GiteePr;

    log.info(`PR 已创建: ${data.html_url}`);
    return { prUrl: data.html_url, prNumber: data.number };
  }

  async viewPr(prUrl: string, log: Logger): Promise<PrStatus> {
    log.verbose(`查询 PR 状态: ${prUrl}`);

    // 从 URL 提取 owner/repo/pull/number
    const match = prUrl.match(
      /gitee\.com\/([^/]+)\/([^/]+)\/pulls\/(\d+)/,
    );
    if (!match) {
      throw new Error(`无法解析 Gitee PR URL: ${prUrl}`);
    }

    const [, owner, repo, number] = match;
    const token = this.getToken();
    const url = `${this.apiBase}/repos/${owner}/${repo}/pulls/${number}?access_token=${token}`;

    const stdout = this.apiGet(url, log);

    type GiteePrDetail = {
      state: string;
      merged_at: string | null;
      closed_at: string | null;
    };
    const data = JSON.parse(stdout) as GiteePrDetail;

    return {
      state: data.state,
      mergedAt: data.merged_at,
      closedAt: data.closed_at,
    };
  }

  /** 获取 Gitee 访问令牌 */
  private getToken(): string {
    const token = process.env["GITEE_TOKEN"];
    if (!token) throw new Error("GITEE_TOKEN 未设置");
    return token;
  }

  /** Gitee API GET 请求（使用 curl，避免 Node fetch 兼容性问题） */
  private apiGet(url: string, log: Logger): string {
    log.verbose(`GET ${url.replace(/access_token=[^&]+/, "access_token=***")}`);
    return execSync(`curl -sS "${url}"`, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 30_000,
    }).trim();
  }

  /** Gitee API POST 请求 */
  private apiPost(url: string, payload: Record<string, unknown>, log: Logger): string {
    const safePayload = { ...payload, access_token: "***" };
    log.verbose(`POST ${url} ${JSON.stringify(safePayload)}`);

    // 用 URL 编码形式发送（Gitee API 接受 form-encoded）
    const params = Object.entries(payload)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");

    return execSync(
      `curl -sS -X POST "${url}" -d "${params.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 30_000,
      },
    ).trim();
  }
}
