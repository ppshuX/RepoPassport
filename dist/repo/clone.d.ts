import type { RepoMeta } from "../types/facts.js";
import type { Logger } from "../utils/log.js";
export interface CloneResult {
    tempDir: string;
    meta: RepoMeta;
}
/**
 * 从 GitHub URL 解析 owner 和 name。
 */
export declare function parseRepoUrl(url: string): {
    owner: string;
    name: string;
} | null;
/**
 * 校验公开 GitHub URL 格式。
 */
export declare function validateGitHubUrl(url: string): boolean;
/**
 * 在临时目录中浅克隆仓库（depth=1）。
 * 返回临时目录路径和仓库元信息。
 */
export declare function cloneRepo(url: string, log: Logger): Promise<CloneResult>;
/**
 * 清理临时目录。
 */
export declare function cleanupTempDir(tempDir: string, log: Logger): Promise<void>;
//# sourceMappingURL=clone.d.ts.map