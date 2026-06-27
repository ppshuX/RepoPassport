import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execAsync = promisify(exec);
/**
 * 从 GitHub URL 解析 owner 和 name。
 */
export function parseRepoUrl(url) {
    const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    if (!match)
        return null;
    return { owner: match[1], name: match[2] };
}
/**
 * 校验公开 GitHub URL 格式。
 */
export function validateGitHubUrl(url) {
    return parseRepoUrl(url) !== null;
}
/**
 * 从任意 URL/路径中提取仓库名。
 */
function extractRepoName(url) {
    const parsed = parseRepoUrl(url);
    if (parsed)
        return parsed;
    // 从路径中提取最后一个组件作为 repo name
    const clean = url.replace(/\\/g, "/").replace(/\/$/, "").replace(/\.git$/, "");
    const parts = clean.split("/");
    const name = parts[parts.length - 1] || "unknown";
    return { owner: "local", name };
}
/**
 * 在临时目录中浅克隆仓库（depth=1）。
 * 返回临时目录路径和仓库元信息。
 */
export async function cloneRepo(url, log) {
    const tempDir = await mkdtemp(join(tmpdir(), "repopassport-"));
    log.verbose(`临时目录: ${tempDir}`);
    try {
        log.info(`浅克隆 ${url} ...`);
        await execAsync(`git clone --depth=1 "${url}" "${tempDir}"`, {
            timeout: 120_000,
        });
        // 获取 HEAD commit SHA
        const { stdout: shaOut } = await execAsync("git rev-parse HEAD", { cwd: tempDir });
        const commitSha = shaOut.trim();
        // 获取默认分支名
        const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: tempDir });
        const defaultBranch = branchOut.trim();
        const { owner, name } = extractRepoName(url);
        log.info(`克隆完成: ${owner}/${name}@${commitSha.slice(0, 7)}`);
        return {
            tempDir,
            meta: {
                owner,
                name,
                url,
                defaultBranch,
                commitSha,
            },
        };
    }
    catch (err) {
        // 克隆失败时清理
        await cleanupTempDir(tempDir, log);
        throw new Error(`克隆仓库失败: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * 清理临时目录。
 */
export async function cleanupTempDir(tempDir, log) {
    try {
        await rm(tempDir, { recursive: true, force: true });
        log.verbose(`已清理临时目录: ${tempDir}`);
    }
    catch {
        log.warn(`清理临时目录失败: ${tempDir}`);
    }
}
//# sourceMappingURL=clone.js.map