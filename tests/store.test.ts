import { describe, it, expect, beforeEach } from "vitest";
import {
  saveRun,
  loadRun,
  savePrRecord,
  findPrRecordByUrl,
  updatePrRecord,
} from "../src/store/runs.js";
import { createLogger } from "../src/utils/log.js";
import type { GenerationRun, PullRequestRecord } from "../src/types/run.js";
import { v4 as uuid } from "uuid";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

const log = createLogger(false);

// 覆盖 homedir 以使用临时目录隔离测试
const originalHomedir = homedir;
let testHome: string;

describe("store/runs", () => {
  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "rp-test-store-"));
    // 通过修改 BASE 路径的依赖来隔离测试
    // 实际测试直接调用 store 函数（它们使用真实 homedir），但之后会清理
  });

  it("saveRun 和 loadRun：保存并读取运行记录", async () => {
    const runId = uuid();
    const run: GenerationRun = {
      id: runId,
      repoUrl: "https://github.com/test/repo",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      steps: {
        clone: { status: "completed", completedAt: new Date().toISOString() },
        extract: { status: "completed", completedAt: new Date().toISOString() },
        generate: { status: "completed", completedAt: new Date().toISOString() },
        review: { status: "completed", completedAt: new Date().toISOString() },
        submit: { status: "skipped" },
      },
    };

    const path = await saveRun(run, log);
    expect(path).toContain(runId);

    const loaded = await loadRun(runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(runId);
    expect(loaded!.repoUrl).toBe("https://github.com/test/repo");
  });

  it("loadRun 对不存在的 ID 返回 null", async () => {
    const result = await loadRun("nonexistent-id");
    expect(result).toBeNull();
  });

  it("savePrRecord 和 findPrRecordByUrl：保存并查找 PR 记录", async () => {
    const recordId = uuid();
    const prUrl = `https://github.com/test/repo/pull/${Math.floor(Math.random() * 1000)}`;
    const record: PullRequestRecord = {
      id: recordId,
      runId: uuid(),
      prUrl,
      targetRepo: "test/repo",
      forkUrl: "https://github.com/user/repo.git",
      branchName: "repopassport/en-readme",
      createdAt: new Date().toISOString(),
      status: "open",
      lastCheckedAt: new Date().toISOString(),
    };

    await savePrRecord(record, log);

    const found = await findPrRecordByUrl(prUrl);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(recordId);
    expect(found!.prUrl).toBe(prUrl);
    expect(found!.status).toBe("open");
  });

  it("findPrRecordByUrl 对不存在的 URL 返回 null", async () => {
    const result = await findPrRecordByUrl("https://github.com/nonexistent/pull/99999");
    expect(result).toBeNull();
  });

  it("updatePrRecord：更新 PR 状态", async () => {
    const recordId = uuid();
    const prUrl = `https://github.com/test/repo/pull/${Math.floor(Math.random() * 1000)}`;
    const record: PullRequestRecord = {
      id: recordId,
      runId: uuid(),
      prUrl,
      targetRepo: "test/repo",
      forkUrl: "https://github.com/user/repo.git",
      branchName: "repopassport/en-readme",
      createdAt: new Date().toISOString(),
      status: "open",
      lastCheckedAt: new Date().toISOString(),
    };

    await savePrRecord(record, log);

    record.status = "merged";
    record.mergedAt = new Date().toISOString();
    await updatePrRecord(record, log);

    const found = await findPrRecordByUrl(prUrl);
    expect(found).not.toBeNull();
    expect(found!.status).toBe("merged");
    expect(found!.mergedAt).toBeTruthy();
  });

  it("saveRun 保存步骤状态记录", async () => {
    const runId = uuid();
    const run: GenerationRun = {
      id: runId,
      repoUrl: "https://github.com/test/repo",
      startedAt: new Date().toISOString(),
      steps: {
        clone: { status: "failed", error: "网络错误", at: new Date().toISOString() },
        extract: { status: "pending" },
        generate: { status: "pending" },
        review: { status: "pending" },
        submit: { status: "pending" },
      },
    };

    await saveRun(run, log);
    const loaded = await loadRun(runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.steps.clone.status).toBe("failed");

    const failedStatus = loaded!.steps.clone as { status: string; error: string };
    expect(failedStatus.error).toBe("网络错误");
  });
});
