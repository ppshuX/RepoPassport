/**
 * REST API 路由。
 * POST /api/analyze — 开始分析
 * GET  /api/runs/:runId — 获取结果
 * POST /api/runs/:runId/submit — 提交 PR
 * POST /api/validate-url — 校验 URL
 */
import { Router, type Request, type Response } from "express";
import { v4 as uuid } from "uuid";
import { runPipeline } from "../pipeline/pipeline.js";
import { submitChanges } from "../services/submit.js";
import { detectPlatform } from "../platform/index.js";
import { cleanupTempDir } from "../repo/cleanup.js";
import { saveRun } from "../store/runs.js";
import { createBufferedLogger } from "../utils/log.js";
import type { PipelineEvent, PipelineResult } from "../pipeline/pipeline.js";
import type { GenerationRun } from "../types/run.js";
import { broadcast, type WsMessage } from "./ws.js";

const router = Router();

/** 内存存储（MVP 阶段不用数据库） */
const runCache = new Map<string, GenerationRun>();
const resultCache = new Map<string, PipelineResult>();

// ── POST /api/analyze ──

router.post("/api/analyze", async (req: Request, res: Response) => {
  const { repoUrl, provider = "mock", model } = req.body as {
    repoUrl?: string;
    provider?: string;
    model?: string;
  };

  if (!repoUrl || typeof repoUrl !== "string") {
    res.status(400).json({ error: "Missing repoUrl" });
    return;
  }

  const runId = uuid();
  const run: GenerationRun = {
    id: runId,
    repoUrl,
    platform: "github",
    startedAt: new Date().toISOString(),
    steps: {
      clone: { status: "pending" },
      extract: { status: "pending" },
      generate: { status: "pending" },
      review: { status: "pending" },
      submit: { status: "skipped" },
    },
  };
  runCache.set(runId, run);

  res.json({ runId, status: "started" });

  // 异步执行管线
  try {
    const onEvent = (event: PipelineEvent) => {
      const wsMsg: WsMessage = {
        type: event.type,
        step: event.step,
        message: event.message,
        data: event.data,
      };
      broadcast(runId, wsMsg);

      // 更新步骤状态
      if (event.type === "step:complete" && event.step && event.step !== "submit") {
        const ts = new Date().toISOString();
        const stepKey = event.step as "clone" | "extract" | "generate" | "review";
        run.steps[stepKey] = { status: "completed", completedAt: ts };
      }
      if (event.type === "step:start" && event.step && event.step !== "submit") {
        const ts = new Date().toISOString();
        const stepKey = event.step as "clone" | "extract" | "generate" | "review";
        run.steps[stepKey] = { status: "running", startedAt: ts };
      }
    };

    const log = createBufferedLogger(
      (level, msg) => broadcast(runId, { type: "log", message: `${level}: ${msg}` }),
      false,
    );

    const result = await runPipeline({
      repoUrl,
      provider: (provider === "openai" || provider === "mock") ? provider : "mock",
      model,
      onEvent,
      log,
    });

    resultCache.set(runId, result);
    run.platform = result.platform;
    run.draftId = runId;
    run.completedAt = new Date().toISOString();
    run.steps.review = { status: "completed", completedAt: new Date().toISOString() };
    runCache.set(runId, run);

    broadcast(runId, { type: "result", data: buildRunResponse(run, result) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ts = new Date().toISOString();
    for (const key of ["clone", "extract", "generate", "review"] as const) {
      if (run.steps[key].status === "running" || run.steps[key].status === "pending") {
        run.steps[key] = { status: "failed", error: msg, at: ts };
      }
    }
    run.completedAt = ts;
    runCache.set(runId, run);

    broadcast(runId, { type: "error", message: msg });
  }
});

// ── GET /api/runs/:runId ──

router.get("/api/runs/:runId", (req: Request, res: Response) => {
  const { runId } = req.params;
  const run = runCache.get(runId);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const result = resultCache.get(runId);
  res.json(buildRunResponse(run, result ?? null));
});

// ── POST /api/runs/:runId/submit ──

router.post("/api/runs/:runId/submit", async (req: Request, res: Response) => {
  const { runId } = req.params;
  const run = runCache.get(runId);
  const result = resultCache.get(runId);

  if (!run || !result) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (run.steps.review?.status !== "completed") {
    res.status(400).json({ error: "Analysis not completed yet" });
    return;
  }

  run.steps.submit = { status: "running", startedAt: new Date().toISOString() };
  runCache.set(runId, run);

  const { adapter } = detectPlatform(run.repoUrl);
  const log = createBufferedLogger(
    (level, msg) => broadcast(runId, { type: "log", message: `${level}: ${msg}` }),
    false,
  );

  try {
    const submitResult = await submitChanges({
      runId,
      tempDir: result.cloneResult.tempDir,
      platform: result.platform,
      adapter,
      cloneResult: result.cloneResult,
      filteredReadme: result.filteredReadme,
      generatedChineseReadme: result.chineseReadme,
      files: result.files,
      log,
      onEvent: (event) => {
        broadcast(runId, {
          type: event.type,
          step: event.step,
          message: event.message,
          data: event.data,
        });
      },
    });

    if (submitResult.success && submitResult.prUrl) {
      run.prRecordId = submitResult.prRecordId;
      run.steps.submit = { status: "completed", completedAt: new Date().toISOString() };
      broadcast(runId, { type: "result", data: { prUrl: submitResult.prUrl } });
    } else if (submitResult.partialFailure) {
      run.steps.submit = {
        status: "partial_failure",
        error: submitResult.error ?? "Unknown",
        at: new Date().toISOString(),
      };
      run.recoveryInfo = submitResult.recoveryInfo;
    } else {
      run.steps.submit = {
        status: "failed",
        error: submitResult.error ?? "Unknown",
        at: new Date().toISOString(),
      };
    }

    run.completedAt = new Date().toISOString();
    runCache.set(runId, run);
    await saveRun(run, log);

    res.json(buildRunResponse(run, result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    run.steps.submit = { status: "failed", error: msg, at: new Date().toISOString() };
    run.completedAt = new Date().toISOString();
    runCache.set(runId, run);

    res.status(500).json({ error: msg });
  }
});

// ── POST /api/validate-url ──

router.post("/api/validate-url", (req: Request, res: Response) => {
  const { repoUrl } = req.body as { repoUrl?: string };

  if (!repoUrl || typeof repoUrl !== "string") {
    res.status(400).json({ error: "Missing repoUrl" });
    return;
  }

  try {
    const { platform } = detectPlatform(repoUrl);
    res.json({ valid: true, platform });
  } catch {
    res.json({ valid: false, error: "Unsupported repository URL" });
  }
});

// ── GET /api/runs ── (历史列表)

router.get("/api/runs", (_req: Request, res: Response) => {
  const runs = Array.from(runCache.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      repoUrl: r.repoUrl,
      platform: r.platform,
      status: r.completedAt ? "completed" : "running",
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    }));

  res.json({ runs });
});

// ── 辅助函数 ──

function buildRunResponse(run: GenerationRun, result: PipelineResult | null) {
  const resp: Record<string, unknown> = {
    runId: run.id,
    status: run.completedAt ? "completed" : "running",
    steps: run.steps,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };

  if (result) {
    resp.result = {
      repo: result.cloneResult.meta,
      platform: result.platform,
      detectedLanguages: result.detectedLanguages,
      filteredReadme: result.filteredReadme,
      chineseReadme: result.chineseReadme,
      evidenceMap: result.evidenceMap,
      facts: result.facts,
    };
  }

  if (run.prRecordId) {
    resp.prUrl = result?.cloneResult ? `https://${result.platform}.com/${result.cloneResult.meta.owner}/${result.cloneResult.meta.name}` : undefined;
  }

  return resp;
}

export { router };
