import type { Logger } from "../utils/log.js";
/**
 * 创建 GitHub Draft PR。依赖 gh CLI。
 */
export interface CreatePrResult {
    prUrl: string;
    prNumber: number;
}
/**
 * 通过 gh CLI 创建 Draft PR。
 */
export declare function createDraftPr(owner: string, repo: string, baseBranch: string, headUser: string, headBranch: string, title: string, body: string, log: Logger): Promise<CreatePrResult>;
/**
 * 查询 PR 状态。
 */
export declare function viewPr(prUrl: string, log: Logger): Promise<{
    state: string;
    mergedAt: string | null;
    closedAt: string | null;
}>;
//# sourceMappingURL=create.d.ts.map