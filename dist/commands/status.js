import { viewPr } from "../pr/create.js";
import { findPrRecordByUrl, updatePrRecord } from "../store/runs.js";
import { createLogger } from "../utils/log.js";
export async function statusCommand(prUrl, verbose) {
    const log = createLogger(verbose);
    // 验证 PR URL 格式
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.test(prUrl)) {
        console.error(`无效的 PR URL: ${prUrl}`);
        console.error("格式: https://github.com/owner/repo/pull/123");
        process.exitCode = 1;
        return;
    }
    try {
        // 先查找本地记录
        const local = await findPrRecordByUrl(prUrl);
        // 查询 gh CLI 最新状态
        log.info("正在查询 PR 状态...");
        const remote = await viewPr(prUrl, log);
        const state = remote.state;
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
        }, null, 2));
    }
    catch (err) {
        console.error("查询失败:", err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
    }
}
//# sourceMappingURL=status.js.map