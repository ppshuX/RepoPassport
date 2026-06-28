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
 * Shell 危险字符/模式检测。
 * 拒绝任何可能用于命令注入的 URL。
 */
const SHELL_DANGER_PATTERN = /[;&|`$(){}<>\\!'"\n\r\t\0]/;

/**
 * 仓库名允许的字符集（owner 和 name）。
 * GitHub/Gitee/ACGit 均限制为字母数字 + 连字符/下划线/点。
 */
const REPO_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * 判断是否为本地文件系统路径（目录且包含 .git）。
 */
export function isLocalRepo(path: string): boolean {
  if (!path || path.trim().length === 0) return false;
  const resolved = resolve(path);
  return existsSync(resolved) && existsSync(join(resolved, ".git"));
}

/**
 * 校验仓库 URL 是否安全且被任一平台支持。
 */
export function validateRepoUrl(url: string): boolean {
  if (!url || url.trim().length === 0) return false;
  if (SHELL_DANGER_PATTERN.test(url)) return false;
  try {
    const { parsed } = detectPlatform(url);
    if (!REPO_NAME_PATTERN.test(parsed.owner) || !REPO_NAME_PATTERN.test(parsed.name)) {
      return false;
    }
    return true;
  } catch {
    return false;
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
 * 从任意 URL/路径中提取仓库名。
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
 * 构建 git -c 配置标志。
 * 从环境变量读取代理和镜像设置，转换为 git 原生 URL 重写规则，
 * 不改动 URL，不侵入 git 全局配置。
 */
function buildGitConfigFlags(): string {
  const flags: string[] = [];

  // HTTPS_PROXY → git http.proxy（小写优先，兼容 libcurl 惯例）
  const proxy = process.env["https_proxy"] || process.env["HTTPS_PROXY"] ||
                process.env["http_proxy"] || process.env["HTTP_PROXY"];
  if (proxy) {
    flags.push(`-c http.proxy=${proxy}`, `-c https.proxy=${proxy}`);
  }

  // REPOPASSPORT_GITHUB_MIRROR → git url.insteadOf（逗号分隔多镜像，git 自动回退）
  const mirror = process.env["REPOPASSPORT_GITHUB_MIRROR"];
  if (mirror) {
    for (const m of mirror.split(",").map(s => s.trim()).filter(Boolean)) {
      if (m.startsWith("http")) {
        // 前缀代理式: https://ghproxy.net → url.https://ghproxy.net/*.insteadOf
        flags.push(`-c url.${m}/https://github.com/.insteadOf=https://github.com/`);
      } else if (/^[a-zA-Z0-9.-]+$/.test(m)) {
        // 域名替换式: kkgithub.com → url.https://kkgithub.com/.insteadOf
        flags.push(`-c url.https://${m}/.insteadOf=https://github.com/`);
      }
    }
  }

  return flags.join(" ");
}

/**
 * 在临时目录中浅克隆仓库（depth=1）。
 */
export async function cloneRepo(url: string, log: Logger): Promise<CloneResult> {
  if (!url || url.trim().length === 0) {
    throw new Error("仓库 URL 不能为空");
  }
  if (SHELL_DANGER_PATTERN.test(url)) {
    throw new Error("仓库 URL 包含不允许的字符");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "repopassport-"));
  log.verbose(`临时目录: ${tempDir}`);

  try {
    const isLocal = isLocalRepo(url);
    const sourcePath = isLocal ? resolve(url) : url;

    if (isLocal) {
      log.info(`从本地路径克隆 ${sourcePath} ...`);
      await execAsync(`git clone --depth=1 --no-hardlinks "file://${sourcePath}" "${tempDir}"`, {
        timeout: 120_000,
      });
    } else {
      const configFlags = buildGitConfigFlags();
      log.info(`浅克隆 ${sourcePath} ...`);
      log.verbose(`git flags: ${configFlags || "(none)"}`);
      await execAsync(`git ${configFlags} clone --depth=1 "${sourcePath}" "${tempDir}"`, {
        timeout: 120_000,
      });
    }

    const { stdout: shaOut } = await execAsync("git rev-parse HEAD", { cwd: tempDir });
    const commitSha = shaOut.trim();

    const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd: tempDir });
    const defaultBranch = branchOut.trim();

    const { owner, name } = extractRepoName(url);
    log.info(`克隆完成: ${owner}/${name}@${commitSha.slice(0, 7)}`);

    return {
      tempDir,
      meta: { owner, name, url, defaultBranch, commitSha },
    };
  } catch (err) {
    await cleanupTempDir(tempDir, log);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`克隆仓库失败: ${msg}`);
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
