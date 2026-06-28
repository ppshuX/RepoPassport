/**
 * prepare 命令 — CLI 适配层。
 *
 * 调用 runPipeline() 执行分析管线，通过 onEvent 推送终端进度。
 * 展示 Diff、证据报告，处理用户交互（y/n/d 或提交确认）。
 *
 * 安全约束：
 * - 默认 Dry-run，绝不执行 Git 写操作。
 * - 只有 --submit 且用户输入完整确认文本后才进入提交。
 */
import { cleanupTempDir } from "../repo/cleanup.js";
import { showNewFileDiff, showDiff } from "../utils/diff.js";
import { formatEvidenceReport } from "../evidence/report.js";
import { createConsoleLogger } from "../utils/log.js";
import type { Logger } from "../utils/log.js";
import type { PrepareOptions } from "../types/config.js";
import type { RepoFacts, FileContent, RepoMeta } from "../types/facts.js";
import type { GenerationRun, ContentEvidenceMap } from "../types/run.js";
import { saveRun } from "../store/runs.js";
import { runPipeline } from "../pipeline/pipeline.js";
import type { PipelineEvent, PipelineResult } from "../pipeline/pipeline.js";
import { submitChanges } from "../services/submit.js";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";

/**
 * prepare 命令主流程。
 */
export async function prepareCommand(
  repoUrl: string,
  options: PrepareOptions,
): Promise<void> {
  const log = createConsoleLogger(options.verbose);
  const runId = uuid();
  const events: PipelineEvent[] = [];

  const onEvent = (event: PipelineEvent) => {
    events.push(event);
    // 只打印关键进度信息
    if (event.type === "step:start" && event.message) {
      log.info(event.message);
    } else if (event.type === "progress" && event.message) {
      log.verbose(event.message);
    } else if (event.type === "step:complete" && event.message) {
      log.info(event.message);
    }
  };

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

  let pipelineResult: PipelineResult | null = null;

  try {
    // ── 前置检查 ──
    log.info("检查前置条件...");

    // 只有 --submit 模式才检查平台前置条件
    if (options.submit) {
      const { detectPlatform } = await import("../platform/index.js");
      const { adapter } = detectPlatform(repoUrl);
      adapter.checkPrerequisites(log);
    }

    // ── 运行分析管线 ──
    pipelineResult = await runPipeline({
      repoUrl,
      provider: options.provider as "openai" | "mock",
      model: options.model,
      onEvent,
      log,
    });

    // 更新步骤状态
    run.platform = pipelineResult.platform;
    const now = new Date().toISOString();
    run.steps.clone = { status: "completed", completedAt: now };
    run.steps.extract = { status: "completed", completedAt: now };
    run.steps.generate = { status: "completed", completedAt: now };

    const {
      cloneResult,
      files,
      facts,
      evidenceMap,
      filteredReadme,
      chineseReadme,
      originalReadme,
      adapter,
    } = pipelineResult;

    // ── 展示审核界面 ──
    run.steps.review = { status: "running", startedAt: new Date().toISOString() };

    const targetRepo = `${cloneResult.meta.owner}/${cloneResult.meta.name}`;
    const isDual = !originalReadme && !!chineseReadme;
    const title = isDual ? "中英文 README 草稿" : "英文 README 草稿";

    // --output: 写入文件
    if (options.output) {
      const outDir = resolve(options.output);
      await mkdir(join(outDir, ".."), { recursive: true }).catch(() => {});
      if (chineseReadme) {
        await writeFile(outDir, chineseReadme, "utf-8");
        log.info(`中文 README 已写入: ${outDir}`);
      }
      const enPath = outDir.replace(/(\.md)?$/i, ".en.md");
      await writeFile(enPath, filteredReadme, "utf-8");
      log.info(`英文 README 已写入: ${enPath}`);
    }

    displayHeader(title, targetRepo, adapter.displayName, cloneResult.meta, options, isDual);

    const existingEnReadme = detectEnglishReadme(files);

    // 显示 Diff
    displayDiffs(chineseReadme, filteredReadme, existingEnReadme);

    // 显示证据报告
    console.log("\n" + formatEvidenceReport(facts, evidenceMap));

    // ── 交互式确认 ──
    if (options.submit) {
      await handleSubmitMode({
        run, runId, pipelineResult, targetRepo, filteredReadme,
        chineseReadme, files, facts, evidenceMap, cloneResult,
        adapter, platform: pipelineResult.platform, log,
      });
    } else {
      await handleDryRunMode({
        run, runId, pipelineResult, targetRepo, filteredReadme,
        chineseReadme, files, facts, evidenceMap, cloneResult, log,
        yes: options.yes,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(sanitizeForOutput(msg));

    const ts = new Date().toISOString();
    for (const key of ["clone", "extract", "generate", "review"] as const) {
      if (run.steps[key].status === "running" || run.steps[key].status === "pending") {
        run.steps[key] = { status: "failed", error: sanitizeForOutput(msg), at: ts };
      }
    }
    run.completedAt = ts;

    try {
      await saveRun(run, log);
    } catch {
      /* 保存失败不阻塞 */
    }

    process.exitCode = 1;
  } finally {
    if (pipelineResult?.cloneResult?.tempDir) {
      await cleanupTempDir(pipelineResult.cloneResult.tempDir, log);
    }
  }
}

// ────────────────────────────────────────────
//  交互处理
// ────────────────────────────────────────────

interface DryRunContext {
  run: GenerationRun;
  runId: string;
  pipelineResult: PipelineResult;
  targetRepo: string;
  filteredReadme: string;
  chineseReadme?: string;
  files: FileContent[];
  facts: RepoFacts;
  evidenceMap: ContentEvidenceMap[];
  cloneResult: { tempDir: string; meta: RepoMeta };
  log: Logger;
  yes: boolean;
}

async function handleDryRunMode(ctx: DryRunContext): Promise<void> {
  const { run, runId, cloneResult, filteredReadme, facts, evidenceMap, chineseReadme, log, yes } = ctx;
  let save = false;

  if (yes) {
    console.log("\n[--yes] 自动保存草稿...");
    save = true;
  } else {
    const choice = await promptUser();
    if (choice === "n") {
      console.log("\n已取消，清理中...");
      run.steps.review = { status: "skipped" };
      run.completedAt = new Date().toISOString();
      await saveRun(run, log);
    } else {
      save = true;
    }
  }

  if (save) {
    const draftPath = await saveDraftLocally(
      runId, cloneResult.meta, filteredReadme, facts, evidenceMap, chineseReadme, log,
    );
    console.log(`\n[Dry-run] 草稿已保存: ${draftPath}`);
    console.log("[Dry-run] 未执行任何 Git 写操作、未创建 Fork 或 PR。");
    run.draftId = runId;
    run.steps.review = { status: "completed", completedAt: new Date().toISOString() };
    run.completedAt = new Date().toISOString();
    await saveRun(run, log);
  }
}

interface SubmitContext {
  run: GenerationRun;
  runId: string;
  pipelineResult: PipelineResult;
  targetRepo: string;
  filteredReadme: string;
  chineseReadme?: string;
  files: FileContent[];
  facts: RepoFacts;
  evidenceMap: ContentEvidenceMap[];
  cloneResult: { tempDir: string; meta: RepoMeta };
  adapter: PipelineResult["adapter"];
  platform: PipelineResult["platform"];
  log: Logger;
}

async function handleSubmitMode(ctx: SubmitContext): Promise<void> {
  const {
    run, runId, pipelineResult, targetRepo, filteredReadme,
    chineseReadme, files, facts, evidenceMap, cloneResult,
    adapter, platform, log,
  } = ctx;

  const submitConfirmed = await promptSubmitConfirmation(targetRepo, log);

  if (!submitConfirmed) {
    console.log("\n确认文本不匹配，已取消提交。");
    run.steps.review = { status: "skipped" };
    run.completedAt = new Date().toISOString();
    await saveRun(run, log);
    return;
  }

  // 先存草稿
  const draftPath = await saveDraftLocally(
    runId, cloneResult.meta, filteredReadme, facts, evidenceMap, chineseReadme, log,
  );
  console.log(`\n草稿已保存: ${draftPath}`);
  run.draftId = runId;
  run.steps.review = { status: "completed", completedAt: new Date().toISOString() };

  // 执行提交
  run.steps.submit = { status: "running", startedAt: new Date().toISOString() };

  const submitResult = await submitChanges({
    runId,
    tempDir: pipelineResult.cloneResult.tempDir,
    platform,
    adapter,
    cloneResult,
    filteredReadme,
    generatedChineseReadme: chineseReadme,
    files,
    log,
    onEvent: (event) => {
      if (event.type === "step:complete" && event.step === "submit") {
        console.log(`\n✅ Draft PR 已创建: ${event.data && typeof event.data === "object" && "prUrl" in event.data ? (event.data as Record<string, unknown>).prUrl : ""}`);
      }
    },
  });

  if (submitResult.success && submitResult.prUrl) {
    console.log(`   使用 repopassport status ${submitResult.prUrl} 查询状态`);
    run.prRecordId = submitResult.prRecordId;
    run.steps.submit = { status: "completed", completedAt: new Date().toISOString() };
    run.recoveryInfo = undefined;
  } else if (submitResult.partialFailure) {
    run.steps.submit = {
      status: "partial_failure",
      error: submitResult.error ?? "未知错误",
      at: new Date().toISOString(),
    };
    run.recoveryInfo = submitResult.recoveryInfo;

    console.log("\n⚠️  部分操作已执行，远程资源未删除。恢复信息：");
    if (submitResult.recoveryInfo) {
      displayRecoveryInfo(submitResult.recoveryInfo);
    }
    process.exitCode = 1;
  } else {
    run.steps.submit = {
      status: "failed",
      error: submitResult.error ?? "未知错误",
      at: new Date().toISOString(),
    };
    process.exitCode = 1;
  }

  run.completedAt = new Date().toISOString();
  await saveRun(run, log);
}

// ────────────────────────────────────────────
//  显示函数（CLI 专用）
// ────────────────────────────────────────────

function displayHeader(
  title: string,
  targetRepo: string,
  displayName: string,
  meta: RepoMeta,
  options: PrepareOptions,
  isDual: boolean,
): void {
  console.log("\n" + "═".repeat(72));
  console.log(`  RepoPassport — ${title}`);
  console.log("═".repeat(72));
  console.log(`  仓库: ${targetRepo}`);
  console.log(`  平台: ${displayName}`);
  console.log(`  Commit: ${meta.commitSha.slice(0, 7)}`);
  console.log(`  Provider: ${options.provider}`);
  console.log(`  模式: ${options.submit ? "提交模式 (--submit)" : "Dry-run (仅预览，无 Git 写操作)"}`);
  if (isDual) {
    console.log(`  生成: README.md (中文) + README.en.md (英文)`);
  }
  if (options.output) {
    console.log(`  输出: ${options.output} / ${options.output.replace(/(\.md)?$/i, ".en.md")}`);
  }
  console.log("═".repeat(72));
}

function displayDiffs(
  chineseReadme: string | undefined,
  filteredReadme: string,
  existingEnReadme: FileContent | null,
): void {
  // 中文 README
  if (chineseReadme) {
    console.log("\n── Diff 预览 [README.md] ──\n");
    console.log(showNewFileDiff(chineseReadme, "README.md"));
  }

  // 英文 README
  console.log(`\n── Diff 预览 [README.en.md] ──\n`);
  if (existingEnReadme) {
    console.log(showDiff(existingEnReadme.content, filteredReadme, existingEnReadme.path));
  } else {
    console.log(showNewFileDiff(filteredReadme, "README.en.md"));
  }
}

function displayRecoveryInfo(info: { failedAt: string; remoteResources: Record<string, unknown>; recoveryCommands: string[] }): void {
  console.log(`   失败步骤: ${info.failedAt}`);
  if (info.remoteResources.forkUrl) {
    console.log(`   Fork: ${info.remoteResources.forkUrl}`);
  }
  if (info.remoteResources.branchName) {
    console.log(`   分支: ${info.remoteResources.branchName}`);
  }
  if (info.remoteResources.remotePushed) {
    console.log(`   已 Push 到远程`);
  }
  console.log("\n   恢复命令（请手动执行）：");
  for (const cmd of info.recoveryCommands) {
    console.log(`   ${cmd}`);
  }
}

// ────────────────────────────────────────────
//  交互函数（CLI 专用）
// ────────────────────────────────────────────

function promptUser(): Promise<"y" | "n" | "d"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n选项:");
    console.log("  [y] 接受，保存草稿到本地");
    console.log("  [n] 放弃，清理临时文件");
    console.log("  [d] 仅保存草稿到本地（同 y，Dry-run 无其他操作）");
    console.log("");

    rl.question("请选择 [y/n/d]: ", (answer) => {
      rl.close();
      const choice = answer.trim().toLowerCase();
      if (choice === "y" || choice === "yes") resolve("y");
      else if (choice === "n" || choice === "no") resolve("n");
      else if (choice === "d") resolve("d");
      else {
        console.log("无效选择，默认放弃。");
        resolve("n");
      }
    });
  });
}

async function promptSubmitConfirmation(
  targetRepo: string,
  log: Logger,
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const expectedText = `SUBMIT ${targetRepo}`;

    console.log("\n" + "═".repeat(72));
    console.log("  ⚠️  提交确认");
    console.log("═".repeat(72));
    console.log(`  目标仓库: ${targetRepo}`);
    console.log(`  操作: Fork → Branch → Commit → Push → Draft PR`);
    console.log(`  影响: 将在平台创建远程 Fork 仓库和 Draft PR`);
    console.log("");
    console.log(`  若要继续，请输入以下确认文本：`);
    console.log(`  ${expectedText}`);
    console.log("");
    console.log("  输入其他任何内容均视为取消。");
    console.log("═".repeat(72));
    console.log("");

    rl.question("> ", (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (trimmed === expectedText) {
        log.info("确认文本匹配，继续提交。");
        resolve(true);
      } else {
        log.info(`确认文本不匹配 (got: "${trimmed}", expected: "${expectedText}")，取消提交。`);
        resolve(false);
      }
    });
  });
}

// ────────────────────────────────────────────
//  工具函数
// ────────────────────────────────────────────

function detectEnglishReadme(files: FileContent[]): FileContent | null {
  const patterns = [/README\.en\.md/i, /README_EN\.md/i, /README-en\.md/i];
  for (const f of files) {
    const name = f.path.split(/[/\\]/).pop() || "";
    if (patterns.some((p) => p.test(name))) {
      return f;
    }
  }
  return null;
}

async function saveDraftLocally(
  runId: string,
  _repoMeta: RepoMeta,
  generatedReadme: string,
  facts: RepoFacts,
  evidenceMap: ContentEvidenceMap[],
  chineseReadme: string | undefined,
  log: Logger,
): Promise<string> {
  const baseDir = join(homedir(), ".repopassport", "drafts");
  await mkdir(baseDir, { recursive: true });

  const draftPath = join(baseDir, runId);
  await mkdir(draftPath, { recursive: true });

  if (chineseReadme) {
    await writeFile(join(draftPath, "README.md"), chineseReadme, "utf-8");
  }
  await writeFile(join(draftPath, "README.en.md"), generatedReadme, "utf-8");
  await writeFile(join(draftPath, "facts.json"), JSON.stringify(facts, null, 2), "utf-8");
  await writeFile(join(draftPath, "evidence.json"), JSON.stringify(evidenceMap, null, 2), "utf-8");

  log.info(`草稿已保存至: ${draftPath}`);
  return draftPath;
}

function sanitizeForOutput(msg: string): string {
  let sanitized = msg;

  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey && apiKey.length > 4) {
    sanitized = sanitized.replaceAll(apiKey, "***REDACTED***");
  }

  const giteeToken = process.env["GITEE_TOKEN"];
  if (giteeToken && giteeToken.length > 4) {
    sanitized = sanitized.replaceAll(giteeToken, "***REDACTED***");
  }

  sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, "***REDACTED***");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9\-_+.]+/gi, "Bearer ***REDACTED***");

  return sanitized;
}
