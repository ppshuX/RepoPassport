import { execSync } from "node:child_process";
import type { Logger } from "../utils/log.js";

/**
 * git 操作工具函数，在克隆后的临时仓库目录中执行。
 * 所有命令自动注入代理和镜像配置（如果环境变量已设置）。
 */

/** 安全分支名/remote名 pattern */
const SAFE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]*$/;

/** 安全文件名 pattern */
const SAFE_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(\.[a-zA-Z0-9]+)?$/;

function assertSafeRef(value: string, label: string): void {
  if (!SAFE_REF_PATTERN.test(value)) {
    throw new Error(`不允许的${label}: "${value}"`);
  }
}

function assertSafeFile(value: string, label: string): void {
  if (!SAFE_FILE_PATTERN.test(value)) {
    throw new Error(`不允许的${label}: "${value}"`);
  }
}

/**
 * 构建 git -c 配置标志。
 * 环境变量驱动，不碰 URL 字符串，不侵入 git 全局配置。
 */
function buildGitConfigFlags(): string {
  const flags: string[] = [];

  const proxy = process.env["https_proxy"] || process.env["HTTPS_PROXY"] ||
                process.env["http_proxy"] || process.env["HTTP_PROXY"];
  if (proxy) {
    flags.push(`-c http.proxy=${proxy}`, `-c https.proxy=${proxy}`);
  }

  const mirror = process.env["REPOPASSPORT_GITHUB_MIRROR"];
  if (mirror) {
    for (const m of mirror.split(",").map(s => s.trim()).filter(Boolean)) {
      if (m.startsWith("http")) {
        flags.push(`-c url.${m}/https://github.com/.insteadOf=https://github.com/`);
      } else if (/^[a-zA-Z0-9.-]+$/.test(m)) {
        flags.push(`-c url.https://${m}/.insteadOf=https://github.com/`);
      }
    }
  }

  return flags.join(" ");
}

export function execGit(cwd: string, args: string, log?: Logger): string {
  const flags = buildGitConfigFlags();
  log?.verbose(`git ${flags} ${args}  [cwd: ${cwd}]`);
  return execSync(`git ${flags} ${args}`, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}

/** 添加 fork remote */
export function addForkRemote(
  cwd: string,
  forkUrl: string,
  log: Logger,
): void {
  // 校验 remote URL 是合法的 git URL
  if (!/^(https?:\/\/|git@)[a-zA-Z0-9._\/:@-]+(\.git)?$/.test(forkUrl)) {
    throw new Error(`不允许的远程 URL: "${forkUrl}"`);
  }
  execGit(cwd, `remote add repopassport-fork "${forkUrl.replace(/"/g, '\\"')}"`, log);
  log.info("已添加 fork remote");
}

/** 移除 fork remote */
export function removeForkRemote(cwd: string, log: Logger): void {
  try {
    execGit(cwd, "remote remove repopassport-fork", log);
  } catch {
    // 不存在则忽略
  }
}

/** 创建并切换到新分支 */
export function createBranch(
  cwd: string,
  branchName: string,
  log: Logger,
): void {
  assertSafeRef(branchName, "分支名");

  let name = branchName;
  // 分支已存在则追加时间戳
  try {
    execGit(cwd, `rev-parse --verify "${branchName}"`, log);
    name = `${branchName}-${Date.now()}`;
  } catch {
    // 分支不存在，可用
  }
  execGit(cwd, `checkout -b "${name}"`, log);
  log.info(`已创建分支: ${name}`);
}

/** 获取当前分支名 */
export function currentBranch(cwd: string, log: Logger): string {
  return execGit(cwd, "rev-parse --abbrev-ref HEAD", log);
}

/** 获取默认分支名（克隆时的 HEAD 分支） */
export function defaultBranch(cwd: string, log: Logger): string {
  return execGit(cwd, "rev-parse --abbrev-ref HEAD", log);
}

/** stage 文件 */
export function stageFile(cwd: string, file: string, log: Logger): void {
  assertSafeFile(file, "文件名");
  execGit(cwd, `add "${file}"`, log);
}

/** 提交 */
export function commit(
  cwd: string,
  message: string,
  body: string,
  log: Logger,
): void {
  // 转义 commit message 中的双引号
  const safeMsg = message.replace(/"/g, '\\"');
  const safeBody = body.replace(/"/g, '\\"');
  execGit(cwd, `commit -m "${safeMsg}" -m "${safeBody}"`, log);
  log.info("已提交");
}

/** 推送到 fork remote */
export function pushBranch(
  cwd: string,
  remote: string,
  branch: string,
  log: Logger,
): void {
  assertSafeRef(remote, "remote 名");
  assertSafeRef(branch, "分支名");
  execGit(cwd, `push "${remote}" "${branch}"`, log);
  log.info(`已推送分支 ${branch} 到 ${remote}`);
}
