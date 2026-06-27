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
 * ACGit（腾讯内部 Git）平台适配器。
 *
 * 支持的 URL 格式:
 *   - https://git.woa.com/group/project.git
 *   - https://git.code.tencent.com/group/project.git
 *
 * ACGit 底层为 GitLab，Fork/MR 操作依赖 GitLab API v4。
 * 前置条件: ACGIT_TOKEN 或 GITLAB_TOKEN 环境变量。
 *
 * NOTE: Fork + MR 链路目前为 stub —— 因 ACGit 需要内部网络环境 +
 * 个人访问令牌方可完整验证，当前仅支持 URL 解析和 git clone。
 * 正式接入时按 GitLab API v4 规范实现即可。
 */
export class ACGitAdapter implements PlatformAdapter {
  readonly type: PlatformType = "acgit";
  readonly displayName = "ACGit (腾讯内部 Git)";

  private static readonly URL_PATTERNS = [
    /^https?:\/\/git\.woa\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    /^https?:\/\/git\.code\.tencent\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  ];

  parseRepoUrl(url: string): ParsedRepoUrl | null {
    for (const pattern of ACGitAdapter.URL_PATTERNS) {
      const match = url.match(pattern);
      if (match) {
        return {
          platform: "acgit",
          owner: match[1],
          name: match[2],
          originalUrl: url,
        };
      }
    }
    return null;
  }

  checkPrerequisites(log: Logger): void {
    const token = process.env["ACGIT_TOKEN"] || process.env["GITLAB_TOKEN"];
    if (token) {
      log.verbose("ACGIT_TOKEN 已配置");
      return;
    }
    // ACGit 是内部平台，不强制要求 token（用户可能只想 dry-run）
    log.verbose("ACGIT_TOKEN 未配置（正式模式需要）");
  }

  async forkRepo(_owner: string, _repo: string, log: Logger): Promise<ForkResult> {
    // TODO: 实现 GitLab API v4 Fork
    // POST /api/v4/projects/{project_id}/fork
    // project_id 需先通过 GET /api/v4/projects?search={repo} 获取
    log.warn("ACGit Fork 功能尚未实现（GitLab API v4 待接入）");
    throw new Error(
      "ACGit 的 Fork/MR 链路暂未实现。\n" +
        "ACGit 底层为 GitLab，需调用 GitLab API v4:\n" +
        "  POST /api/v4/projects/:id/fork\n" +
        "  POST /api/v4/projects/:id/merge_requests\n" +
        "当前请使用 --dry-run 模式预览草稿。",
    );
  }

  async createDraftPr(
    _params: CreatePrParams,
    _log: Logger,
  ): Promise<CreatePrResult> {
    // TODO: 实现 GitLab API v4 Merge Request
    // POST /api/v4/projects/{id}/merge_requests
    throw new Error(
      "ACGit 的 MR 创建功能尚未实现。请使用 --dry-run 模式。",
    );
  }

  async viewPr(_prUrl: string, _log: Logger): Promise<PrStatus> {
    // TODO: 实现 GitLab API v4 MR 查询
    // GET /api/v4/projects/{id}/merge_requests/{mr_iid}
    throw new Error(
      "ACGit 的 MR 查询功能尚未实现。",
    );
  }
}
