import type { Logger } from "../utils/log.js";
/**
 * Fork 仓库操作。依赖 gh CLI。
 */
export interface ForkResult {
    forkUrl: string;
    forkOwner: string;
}
/**
 * 通过 gh CLI fork 仓库到当前用户名下。
 * --clone=false：不在本地创建新克隆（我们已在临时目录中克隆原仓库）
 * --remote=false：不添加 remote（我们手动管理）
 */
export declare function forkRepo(owner: string, repo: string, log: Logger): Promise<ForkResult>;
//# sourceMappingURL=fork.d.ts.map