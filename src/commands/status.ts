import { detectPlatform } from "../platform/index.js";
import { findPrRecordByUrl, updatePrRecord } from "../store/runs.js";
import { createLogger } from "../utils/log.js";

export async function statusCommand(prUrl: string, verbose: boolean): Promise<void> {
  const log = createLogger(verbose);

  // 检测平台
  let adapter;
  try {
    ({ adapter } = detectPlatform(prUrl));
  } catch {
    const { adapter: fallback } = detectPlatform("https://github.com/owner/repo");
    adapter = fallback;
  }

  // 验证 PR URL 格式（平台特定）
  const prPatterns: Record<string, RegExp> = {
    github: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/,
    gitee: /^https:\/\/gitee\.com\/[\w.-]+\/[\w.-]+\/pulls\/\d+/,
    acgit: /^https:\/\/git\.(woa|code\.tencent)\.com\/.+\/merge_requests\/\d+/,
  };

  const pattern = prPatterns[adapter.type];
  if (pattern && !pattern.test(prUrl)) {
    console.error(`无效的 PR URL: ${prUrl}`);
    console.error(`期望格式 (${adapter.displayName}): ${pattern}`);
    process.exitCode = 1;
    return;
  }

  try {
    // 先查找本地记录
    const local = await findPrRecordByUrl(prUrl);

    // 查询平台最新状态
    log.info(`正在查询 PR 状态 (${adapter.displayName})...`);
    const remote = await adapter.viewPr(prUrl, log);

    const state = remote.state as "open" | "closed" | "merged" | "unknown";
    const now = new Date().toISOString();

    // 更新本地记录
    if (local) {
      local.status = state;
      local.mergedAt = remote.mergedAt ?? local.mergedAt;
      local.closedAt = remote.closedAt ?? local.closedAt;
      local.lastCheckedAt = now;
      await updatePrRecord(local, log);
    }

    console.log(JSON.stringify({
      state,
      mergedAt: remote.mergedAt,
      closedAt: remote.closedAt,
      url: prUrl,
      platform: adapter.type,
    }, null, 2));
  } catch (err) {
    console.error("查询失败:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
