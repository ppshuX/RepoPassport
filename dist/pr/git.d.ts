import type { Logger } from "../utils/log.js";
/**
 * git 操作工具函数，在克隆后的临时仓库目录中执行。
 */
export declare function execGit(cwd: string, args: string, log?: Logger): string;
/** 添加 fork remote */
export declare function addForkRemote(cwd: string, forkUrl: string, log: Logger): void;
/** 移除 fork remote */
export declare function removeForkRemote(cwd: string, log: Logger): void;
/** 创建并切换到新分支 */
export declare function createBranch(cwd: string, branchName: string, log: Logger): void;
/** 获取当前分支名 */
export declare function currentBranch(cwd: string, log: Logger): string;
/** 获取默认分支名（克隆时的 HEAD 分支） */
export declare function defaultBranch(cwd: string, log: Logger): string;
/** stage 文件 */
export declare function stageFile(cwd: string, file: string, log: Logger): void;
/** 提交 */
export declare function commit(cwd: string, message: string, body: string, log: Logger): void;
/** 推送到 fork remote */
export declare function pushBranch(cwd: string, remote: string, branch: string, log: Logger): void;
//# sourceMappingURL=git.d.ts.map