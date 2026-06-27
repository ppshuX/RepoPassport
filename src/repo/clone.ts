import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RepoMeta } from "../types/facts.js";
import type { Logger } from "../utils/log.js";
import { detectPlatform } from "../platform/index.js";
import type { ParsedRepoUrl } from "../platform/index.js";

const execAsync = promisify(exec);

export interface CloneResult {
  tempDir: string;
  meta: RepoMeta;
}

/**
 * 判断是否为本地文件系统路径（目录且包含 .git）。
 */
export function isLocalRepo(path: string): boolean {
  const resolved = resolve(path);
  return existsSync(resolved) && existsSync(join(resolved, ".git"));
}

/**
 * 校验仓库 URL 是否被任一平台支持。
 */
export function validateRepoUrl(url: string): boolean {
  try {
    detectPlatform(url);
    return true;
  } catch {
    return isLocalRepo(url);
  }
}

/**
 * 从 URL 解析仓库信息（平台、owner、name）。
 */
export function parseRepoUrl(url: string): ParsedRepoUrl | null {
  try {
    return detectPlatform(url).parsed;
  } catch {
    return null;
  }
}

/**
 * 从任意 URL/路径中提取仓库名（用于 clone 阶段的 meta 生成）。
 */
function extractRepoName(url: string): { owner: string; name: string; platform?: string } {
  const parsed = parseRepoUrl(url);
  if (parsed) return { owner: parsed.owner, name: parsed.name, platform: parsed.platform };

  const clean = url.replace(/\\/g, "/").replace(/\/$/, "").replace(/\.git$/, "");
  const parts = clean.split("/");
  const name = parts[parts.length - 1] || "unknown";
  return { owner: "local", name };
}

/**
 * 在临时目录中浅克隆仓库（depth=1）。
 * 支持远程 URL 和本地路径。
 * 返回临时目录路径和仓库元信息。
 */
export async function cloneRepo(url: string, log: Logger): Promise<CloneResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "repopassport-"));
  log.verbose(`临时目录: ${tempDir}`);

  try {
    const isLocal = isLocalRepo(url);
    const sourcePath = isLocal ? resolve(url) : url;

    if (isLocal) {
      log.info(`从本地路径克隆 ${sourcePath} ...`);
      // 本地路径使用 --no-hardlinks 避免 Windows 上的权限问题
      await execAsync(`git clone --depth=1 --no-hardlinks "file://${sourcePath}" "${tempDir}"`, {
        timeout: 120_000,
      });
    } else {
      log.info(`浅克隆 ${sourcePath} ...`);
      await execAsync(`git clone --depth=1 "${sourcePath}" "${tempDir}"`, {
        timeout: 120_000,
      });
    }

    // 获取 HEAD commit SHA
    const { stdout: shaOut } = await execAsync("git rev-parse HEAD", { cwd: tempDir });
    const commitSha = shaOut.trim();

    // 获取默认分支名
    const { stdout: branchOut } = await execAsync(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: tempDir },
    );
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
  } catch (err) {
    // 克隆失败时清理
    await cleanupTempDir(tempDir, log);
    throw new Error(`克隆仓库失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 清理临时目录。
 */
export async function cleanupTempDir(tempDir: string, log: Logger): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
    log.verbose(`已清理临时目录: ${tempDir}`);
  } catch {
    log.warn(`清理临时目录失败: ${tempDir}`);
  }
}
