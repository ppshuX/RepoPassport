import { execSync } from "node:child_process";
/**
 * 通过 gh CLI fork 仓库到当前用户名下。
 * --clone=false：不在本地创建新克隆（我们已在临时目录中克隆原仓库）
 * --remote=false：不添加 remote（我们手动管理）
 */
export async function forkRepo(owner, repo, log) {
    log.info(`正在 Fork ${owner}/${repo} ...`);
    const cmd = `gh repo fork ${owner}/${repo} --clone=false --remote=false --fork-name ${repo}`;
    log.verbose(cmd);
    const stdout = execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 60_000,
    });
    // gh repo fork 输出 fork URL
    const match = stdout.match(/(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\s|$)/);
    if (!match) {
        // 退路：拼出 fork URL
        try {
            const user = execSync("gh api user --jq .login", {
                encoding: "utf-8",
                stdio: "pipe",
            }).trim();
            log.info(`Fork 完成: ${user}/${repo}`);
            return {
                forkUrl: `https://github.com/${user}/${repo}.git`,
                forkOwner: user,
            };
        }
        catch {
            throw new Error(`无法解析 Fork 结果: ${stdout.trim()}`);
        }
    }
    const forkOwner = match[1];
    const forkUrl = `https://github.com/${forkOwner}/${repo}.git`;
    log.info(`Fork 完成: ${forkOwner}/${repo}`);
    return { forkUrl, forkOwner };
}
//# sourceMappingURL=fork.js.map