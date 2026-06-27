import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Logger } from "../utils/log.js";
import type { GenerationRun } from "../types/run.js";
import type { PullRequestRecord } from "../types/run.js";

const BASE = join(homedir(), ".repopassport");

function runsDir() {
  return join(BASE, "runs");
}
function prsDir() {
  return join(BASE, "prs");
}

/** 保存运行记录 */
export async function saveRun(run: GenerationRun, log: Logger): Promise<string> {
  const dir = runsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${run.id}.json`);
  await writeFile(path, JSON.stringify(run, null, 2), "utf-8");
  log.verbose(`运行记录已保存: ${path}`);
  return path;
}

/** 读取运行记录 */
export async function loadRun(runId: string): Promise<GenerationRun | null> {
  try {
    const path = join(runsDir(), `${runId}.json`);
    const data = await readFile(path, "utf-8");
    return JSON.parse(data) as GenerationRun;
  } catch {
    return null;
  }
}

/** 保存 PR 记录 */
export async function savePrRecord(
  record: PullRequestRecord,
  log: Logger,
): Promise<string> {
  const dir = prsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${record.id}.json`);
  await writeFile(path, JSON.stringify(record, null, 2), "utf-8");
  log.verbose(`PR 记录已保存: ${path}`);
  return path;
}

/** 按 PR URL 查找记录 */
export async function findPrRecordByUrl(
  prUrl: string,
): Promise<PullRequestRecord | null> {
  try {
    const dir = prsDir();
    await mkdir(dir, { recursive: true });

    // 简单扫描 prs/ 目录
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readFile(join(dir, file), "utf-8");
      const record = JSON.parse(data) as PullRequestRecord;
      if (record.prUrl === prUrl) return record;
    }

    return null;
  } catch {
    return null;
  }
}

/** 更新 PR 记录 */
export async function updatePrRecord(
  record: PullRequestRecord,
  log: Logger,
): Promise<void> {
  await savePrRecord(record, log);
}

/** 加载所有 PR 记录 */
export async function loadAllPrRecords(): Promise<PullRequestRecord[]> {
  try {
    const dir = prsDir();
    await mkdir(dir, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);

    const records: PullRequestRecord[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readFile(join(dir, file), "utf-8");
      records.push(JSON.parse(data) as PullRequestRecord);
    }
    return records;
  } catch {
    return [];
  }
}
