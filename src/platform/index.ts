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
 * 从 URL 自动检测平台并返回适配器。
 * 依次尝试每个适配器的 parseRepoUrl，返回第一个匹配的。
 */
export function detectPlatform(url: string): { adapter: PlatformAdapter; parsed: ParsedRepoUrl } {
  for (const adapter of adapters) {
    const parsed = adapter.parseRepoUrl(url);
    if (parsed) {
      return { adapter, parsed };
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
