import { execSync } from "node:child_process";
/**
 * git 操作工具函数，在克隆后的临时仓库目录中执行。
 */
export function execGit(cwd, args, log) {
    log?.verbose(`git ${args}  [cwd: ${cwd}]`);
    return execSync(`git ${args}`, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}
/** 添加 fork remote */
export function addForkRemote(cwd, forkUrl, log) {
    execGit(cwd, `remote add repopassport-fork ${forkUrl}`, log);
    log.info("已添加 fork remote");
}
/** 移除 fork remote */
export function removeForkRemote(cwd, log) {
    try {
        execGit(cwd, "remote remove repopassport-fork", log);
    }
    catch {
        // 不存在则忽略
    }
}
/** 创建并切换到新分支 */
export function createBranch(cwd, branchName, log) {
    let name = branchName;
    // 分支已存在则追加时间戳
    try {
        execGit(cwd, `rev-parse --verify ${branchName}`, log);
        name = `${branchName}-${Date.now()}`;
    }
    catch {
        // 分支不存在，可用
    }
    execGit(cwd, `checkout -b ${name}`, log);
    log.info(`已创建分支: ${name}`);
}
/** 获取当前分支名 */
export function currentBranch(cwd, log) {
    return execGit(cwd, "rev-parse --abbrev-ref HEAD", log);
}
/** 获取默认分支名（克隆时的 HEAD 分支） */
export function defaultBranch(cwd, log) {
    return execGit(cwd, "rev-parse --abbrev-ref HEAD", log);
}
/** stage 文件 */
export function stageFile(cwd, file, log) {
    execGit(cwd, `add "${file}"`, log);
}
/** 提交 */
export function commit(cwd, message, body, log) {
    execGit(cwd, `commit -m "${message}" -m "${body}"`, log);
    log.info("已提交");
}
/** 推送到 fork remote */
export function pushBranch(cwd, remote, branch, log) {
    execGit(cwd, `push ${remote} ${branch}`, log);
    log.info(`已推送分支 ${branch} 到 ${remote}`);
}
//# sourceMappingURL=git.js.map