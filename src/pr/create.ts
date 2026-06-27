import { execSync } from "node:child_process";
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
export async function createDraftPr(
  owner: string,
  repo: string,
  baseBranch: string,
  headUser: string,
  headBranch: string,
  title: string,
  body: string,
  log: Logger,
): Promise<CreatePrResult> {
  log.info(`正在创建 Draft PR 到 ${owner}/${repo} ...`);

  const bodyEscaped = body.replace(/"/g, '\\"').replace(/\n/g, "\\n");

  const cmd =
    `gh pr create ` +
    `--repo ${owner}/${repo} ` +
    `--base ${baseBranch} ` +
    `--head ${headUser}:${headBranch} ` +
    `--title "${title}" ` +
    `--body "${bodyEscaped}" ` +
    `--draft`;

  log.verbose(cmd);

  const stdout = execSync(cmd, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  }).trim();

  // 输出格式如: https://github.com/owner/repo/pull/42
  const urlMatch = stdout.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/);
  if (!urlMatch) {
    throw new Error(`无法解析 PR URL: ${stdout}`);
  }

  const prUrl = urlMatch[0];
  const prNumber = parseInt(urlMatch[1], 10);

  log.info(`PR 已创建: ${prUrl}`);
  return { prUrl, prNumber };
}

/**
 * 查询 PR 状态。
 */
export async function viewPr(
  prUrl: string,
  log: Logger,
): Promise<{
  state: string;
  mergedAt: string | null;
  closedAt: string | null;
}> {
  log.verbose(`查询 PR 状态: ${prUrl}`);

  const stdout = execSync(
    `gh pr view "${prUrl}" --json state,mergedAt,closedAt`,
    { encoding: "utf-8", stdio: "pipe" },
  ).trim();

  const data = JSON.parse(stdout) as {
    state: string;
    mergedAt: string | null;
    closedAt: string | null;
  };

  return data;
}
