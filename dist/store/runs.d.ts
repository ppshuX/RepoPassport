import type { Logger } from "../utils/log.js";
import type { GenerationRun } from "../types/run.js";
import type { PullRequestRecord } from "../types/run.js";
/** 保存运行记录 */
export declare function saveRun(run: GenerationRun, log: Logger): Promise<string>;
/** 读取运行记录 */
export declare function loadRun(runId: string): Promise<GenerationRun | null>;
/** 保存 PR 记录 */
export declare function savePrRecord(record: PullRequestRecord, log: Logger): Promise<string>;
/** 按 PR URL 查找记录 */
export declare function findPrRecordByUrl(prUrl: string): Promise<PullRequestRecord | null>;
/** 更新 PR 记录 */
export declare function updatePrRecord(record: PullRequestRecord, log: Logger): Promise<void>;
/** 加载所有 PR 记录 */
export declare function loadAllPrRecords(): Promise<PullRequestRecord[]>;
//# sourceMappingURL=runs.d.ts.map