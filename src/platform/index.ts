import type { PlatformAdapter, PlatformType, ParsedRepoUrl } from "./types.js";
import { GitHubAdapter } from "./github.js";
import { GiteeAdapter } from "./gitee.js";
import { ACGitAdapter } from "./acgit.js";

/** 按优先级排列的适配器列表（先匹配的先返回） */
const adapters: PlatformAdapter[] = [
  new GitHubAdapter(),
  new GiteeAdapter(),
  new ACGitAdapter(),
];

/**
 * PR/MR URL 平台匹配模式（用于 status 命令）。
 * 因为 PR URL 路径与仓库 URL 不同，需要额外检测。
 */
const PR_URL_PATTERNS: Array<{ pattern: RegExp; platform: PlatformType }> = [
  { pattern: /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/, platform: "github" },
  { pattern: /^https?:\/\/gitee\.com\/[\w.-]+\/[\w.-]+\/pulls\/\d+/, platform: "gitee" },
  { pattern: /^https?:\/\/git\.(woa|code\.tencent)\.com\/.+\/merge_requests\/\d+/, platform: "acgit" },
];

/**
 * Shell 危险字符/模式检测。
 * 拒绝任何可能用于命令注入的 URL。
 */
const SHELL_DANGER_PATTERN = /[;&|`$(){}<>\\!'"\n\r\t\0]/;

/**
 * 从 URL 自动检测平台并返回适配器。
 * 依次尝试每个适配器的 parseRepoUrl，返回第一个匹配的。
 * 如果仓库 URL 不匹配，再尝试 PR URL 模式。
 */
export function detectPlatform(url: string): { adapter: PlatformAdapter; parsed: ParsedRepoUrl } {
  // 安全预检：拒绝含 Shell 元字符的空输入
  if (!url || url.trim().length === 0) {
    throw new Error("URL 不能为空");
  }
  if (SHELL_DANGER_PATTERN.test(url)) {
    throw new Error(`URL 包含不允许的字符: ${url}`);
  }

  // 1. 尝试仓库 URL 模式
  for (const adapter of adapters) {
    const parsed = adapter.parseRepoUrl(url);
    if (parsed) {
      return { adapter, parsed };
    }
  }

  // 2. 尝试 PR URL 模式
  for (const { pattern, platform } of PR_URL_PATTERNS) {
    if (pattern.test(url)) {
      const adapter = adapters.find((a) => a.type === platform);
      if (adapter) {
        return {
          adapter,
          parsed: {
            platform,
            owner: "unknown",
            name: "unknown",
            originalUrl: url,
          },
        };
      }
    }
  }

  throw new Error(
    `无法识别的仓库 URL: ${url}\n` +
      `支持的平台: github.com, gitee.com, git.woa.com, git.code.tencent.com`,
  );
}

/**
 * 根据平台类型获取适配器。
 */
export function getAdapter(type: PlatformType): PlatformAdapter {
  const adapter = adapters.find((a) => a.type === type);
  if (!adapter) {
    throw new Error(`未找到平台适配器: ${type}`);
  }
  return adapter;
}

export type { PlatformAdapter, PlatformType, ParsedRepoUrl } from "./types.js";
export type { ForkResult, CreatePrParams, CreatePrResult, PrStatus } from "./types.js";
