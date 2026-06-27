import { cloneRepo, isLocalRepo } from "../repo/clone.js";
import { cleanupTempDir } from "../repo/cleanup.js";
import { collectFiles } from "../repo/files.js";
import { createProvider, MockProvider } from "../ai/client.js";
import { extractFacts } from "../ai/extract.js";
import { generateReadme, generateChineseReadme } from "../ai/generate.js";
import { buildContentEvidenceMap, formatEvidenceReport } from "../evidence/report.js";
import { showNewFileDiff, showDiff } from "../utils/diff.js";
import { createLogger } from "../utils/log.js";
import type { Logger } from "../utils/log.js";
import type { PrepareOptions, ProviderConfig } from "../types/config.js";
import type { Provider } from "../ai/client.js";
import type { RepoFacts, FileContent, RepoMeta } from "../types/facts.js";
import type { GenerationRun, ContentEvidenceMap, SubmitRecoveryInfo } from "../types/run.js";
import { detectPlatform } from "../platform/index.js";
import type { PlatformAdapter, PlatformType } from "../platform/index.js";
import {
  addForkRemote,
  removeForkRemote,
  createBranch,
  currentBranch,
  defaultBranch,
  stageFile,
  commit,
  pushBranch,
  execGit,
} from "../pr/git.js";
import { saveRun, savePrRecord } from "../store/runs.js";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { execSync } from "node:child_process";

/**
 * prepare 命令主流程。
 *
 * 安全约束：
 * - 默认 Dry-run，绝不执行 Git 写操作。
 * - 只有 --submit 且用户输入完整确认文本后才进入提交。
 */
export async function prepareCommand(
  repoUrl: string,
  options: PrepareOptions,
): Promise<void> {
  const log = createLogger(options.verbose);
  const runId = uuid();

  // ── 0. 检测平台 ──
  const { adapter } = detectPlatform(repoUrl);
  const platform = adapter.type;
  log.info(`检测到平台: ${adapter.displayName}`);

  const run: GenerationRun = {
    id: runId,
    repoUrl,
    platform,
    startedAt: new Date().toISOString(),
    steps: {
      clone: { status: "pending" },
      extract: { status: "pending" },
      generate: { status: "pending" },
      review: { status: "pending" },
      submit: { status: "skipped" },
    },
  };

  let tempDir: string | undefined;

  try {
    // ── 1. 前置检查 ──
    log.info("检查前置条件...");
    checkGitAvailable(log);

    // 只有 --submit 模式才检查平台前置条件
    if (options.submit) {
      adapter.checkPrerequisites(log);
    }

    // ── 2. 克隆与分析 ──
    run.steps.clone = { status: "running", startedAt: new Date().toISOString() };
    const cloneResult = await cloneRepo(repoUrl, log);
    tempDir = cloneResult.tempDir;
    run.steps.clone = { status: "completed", completedAt: new Date().toISOString() };

    const files = await collectFiles(tempDir, log);
    log.info(`共收集 ${files.length} 个文件`);

    const originalReadme = files.find(
      (f) => f.path.endsWith("/README.md") || f.path.endsWith("\\README.md"),
    )?.content;

    // ── 3. 事实提取 ──
    run.steps.extract = { status: "running", startedAt: new Date().toISOString() };
    const provider = createProviderFromOptions(options);
    const facts = await extractFacts(files, cloneResult.meta, provider, log);
    run.steps.extract = { status: "completed", completedAt: new Date().toISOString() };

    // ── 4. 文档生成 ──
    run.steps.generate = { status: "running", startedAt: new Date().toISOString() };

    // 如果没有 README.md，先生成中文 README
    let generatedChineseReadme: string | undefined;
    if (!originalReadme) {
      generatedChineseReadme = await generateChineseReadme(facts, provider, log);
    }

    const generatedReadme = await generateReadme(facts, originalReadme, provider, log);
    run.steps.generate = { status: "completed", completedAt: new Date().toISOString() };

    // ── 5. 构建内容证据映射 ──
    const contentEvidenceMap = buildContentEvidenceMap(generatedReadme, facts);
    const filteredReadme = filterReadmeByEvidence(generatedReadme, contentEvidenceMap);

    // ── 6. 展示审核界面 ──
    run.steps.review = { status: "running", startedAt: new Date().toISOString() };

    const targetRepo = `${cloneResult.meta.owner}/${cloneResult.meta.name}`;
    const isDual = !originalReadme && !!generatedChineseReadme;

    const title = isDual ? "中英文 README 草稿" : "英文 README 草稿";
    console.log("\n" + "═".repeat(72));
    console.log(`  RepoPassport — ${title}`);
    console.log("═".repeat(72));
    console.log(`  仓库: ${targetRepo}`);
    console.log(`  平台: ${adapter.displayName}`);
    console.log(`  Commit: ${cloneResult.meta.commitSha.slice(0, 7)}`);
    console.log(`  Provider: ${options.provider}`);
    console.log(`  模式: ${options.submit ? "提交模式 (--submit)" : "Dry-run (仅预览，无 Git 写操作)"}`);
    if (isDual) {
      console.log(`  生成: README.md (中文) + README.en.md (英文)`);
    }
    console.log("═".repeat(72));

    const existingEnReadme = detectEnglishReadme(files);

    // 显示 Diff — 中文 README
    if (generatedChineseReadme) {
      console.log("\n── Diff 预览 [README.md] ──\n");
      console.log(showNewFileDiff(generatedChineseReadme, "README.md"));
    }

    // 显示 Diff — 英文 README
    console.log(`\n── Diff 预览 [README.en.md] ──\n`);
    if (existingEnReadme) {
      console.log(showDiff(existingEnReadme.content, filteredReadme, existingEnReadme.path));
    } else {
      console.log(showNewFileDiff(filteredReadme, "README.en.md"));
    }

    // 显示证据报告
    console.log("\n" + formatEvidenceReport(facts, contentEvidenceMap));

    // ── 7. 交互式确认 ──
    if (options.submit) {
      // ── 提交模式：必须输入确认文本 ──
      const submitConfirmed = await promptSubmitConfirmation(targetRepo, log);

      if (!submitConfirmed) {
        console.log("\n确认文本不匹配，已取消提交。");
        run.steps.review = { status: "skipped" };
        run.completedAt = new Date().toISOString();
        await saveRun(run, log);
      } else {
        // 先存草稿
        const draftPath = await saveDraftLocally(
          runId, cloneResult.meta, filteredReadme, facts, contentEvidenceMap, generatedChineseReadme, log,
        );
        console.log(`\n草稿已保存: ${draftPath}`);
        run.draftId = runId;
        run.steps.review = { status: "completed", completedAt: new Date().toISOString() };

        // 执行提交
        await submitChanges({
          run,
          runId,
          tempDir: tempDir!,
          cloneResult,
          adapter,
          platform,
          options,
          filteredReadme,
          generatedChineseReadme,
          files,
          log,
        });
      }
    } else {
      // ── Dry-run 模式：y/n/d 交互 ──
      const choice = await promptUser();

      if (choice === "n") {
        console.log("\n已取消，清理中...");
        run.steps.review = { status: "skipped" };
        run.completedAt = new Date().toISOString();
        await saveRun(run, log);
      } else {
        const draftPath = await saveDraftLocally(
          runId, cloneResult.meta, filteredReadme, facts, contentEvidenceMap, generatedChineseReadme, log,
        );
        console.log(`\n[Dry-run] 草稿已保存: ${draftPath}`);
        console.log("[Dry-run] 未执行任何 Git 写操作、未创建 Fork 或 PR。");
        run.draftId = runId;
        run.steps.review = { status: "completed", completedAt: new Date().toISOString() };
        run.completedAt = new Date().toISOString();
        await saveRun(run, log);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(sanitizeForOutput(msg));

    const ts = new Date().toISOString();
    for (const key of ["clone", "extract", "generate", "review"] as const) {
      if (run.steps[key].status === "running") {
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
    if (tempDir) {
      await cleanupTempDir(tempDir, log);
    }
  }
}

// ────────────────────────────────────────────
//  提交子流程（仅在 --submit 且确认后进入）
// ────────────────────────────────────────────

interface SubmitContext {
  run: GenerationRun;
  runId: string;
  tempDir: string;
  cloneResult: { tempDir: string; meta: RepoMeta };
  adapter: PlatformAdapter;
  platform: PlatformType;
  options: PrepareOptions;
  filteredReadme: string;
  generatedChineseReadme?: string;
  files: FileContent[];
  log: Logger;
}

async function submitChanges(ctx: SubmitContext): Promise<void> {
  const { run, runId, tempDir, cloneResult, adapter, platform, filteredReadme, generatedChineseReadme, files, log } = ctx;
  const targetRepo = `${cloneResult.meta.owner}/${cloneResult.meta.name}`;

  run.steps.submit = { status: "running", startedAt: new Date().toISOString() };

  // 确定文件名
  const existingEn = detectEnglishReadme(files);
  const englishReadmeName = existingEn ? basename(existingEn.path) : "README.en.md";

  // 写中文 README（如有）
  if (generatedChineseReadme) {
    await writeFile(join(tempDir, "README.md"), generatedChineseReadme, "utf-8");
    log.info("中文 README.md 已写入临时目录");
  }

  // 在临时克隆目录中写入英文 README
  const targetPath = join(tempDir, englishReadmeName);
  await writeFile(targetPath, filteredReadme, "utf-8");

  let forkUrl: string | undefined;
  let forkOwner: string | undefined;
  let branchName = "";
  const originalBranch = defaultBranch(tempDir, log);

  // 恢复信息积累
  const recoveryInfo: SubmitRecoveryInfo = {
    failedAt: "fork",
    remoteResources: {},
    recoveryCommands: [],
  };

  try {
    // Step 1: Fork
    log.info("── Fork 仓库 ──");
    const forkResult = await adapter.forkRepo(cloneResult.meta.owner, cloneResult.meta.name, log);
    forkUrl = forkResult.forkUrl;
    forkOwner = forkResult.forkOwner;
    recoveryInfo.remoteResources.forkUrl = forkUrl;
    recoveryInfo.remoteResources.forkOwner = forkOwner;

    // Step 2: 添加 remote
    log.info("── 添加 Fork Remote ──");
    addForkRemote(tempDir, forkResult.forkUrl, log);

    // Step 3: 创建分支（检测重复分支，避免冲突）
    recoveryInfo.failedAt = "branch";
    log.info("── 创建分支 ──");
    createBranch(tempDir, "repopassport/en-readme", log);
    branchName = currentBranch(tempDir, log);
    recoveryInfo.remoteResources.branchName = branchName;

    // Step 4: Stage
    recoveryInfo.failedAt = "commit";
    log.info("── Stage 文件 ──");
    if (generatedChineseReadme) {
      stageFile(tempDir, "README.md", log);
    }
    stageFile(tempDir, englishReadmeName, log);

    // Step 5: Commit
    log.info("── Commit ──");
    const commitMsg = generatedChineseReadme
      ? "docs: add Chinese and English README"
      : "docs: add English README";
    commit(
      tempDir,
      commitMsg,
      "AI-assisted English README generation. Human-reviewed before submission.\n\n" +
        "Evidence extracted from:\n- package.json\n- Source files\n- Existing documentation\n\n" +
        `Generated by RepoPassport (run: ${runId})`,
      log,
    );

    // Step 6: Push
    recoveryInfo.failedAt = "push";
    log.info("── Push 到 Fork ──");
    pushBranch(tempDir, "repopassport-fork", branchName, log);
    recoveryInfo.remoteResources.remotePushed = true;

    // Step 7: 创建 Draft PR
    recoveryInfo.failedAt = "pr_create";
    log.info("── 创建 Draft PR ──");
    const prResult = await adapter.createDraftPr(
      {
        targetOwner: cloneResult.meta.owner,
        targetRepo: cloneResult.meta.name,
        baseBranch: cloneResult.meta.defaultBranch,
        headUser: forkOwner,
        headBranch: branchName,
        title: "docs: add English README",
        body:
          "## Summary\n\n" +
          "AI-assisted English README generation. Human-reviewed before submission.\n\n" +
          "## What Changed\n\n" +
          `- Added ${englishReadmeName} (English README)\n` +
          "- Original Chinese README.md preserved\n\n" +
          "Evidence extracted from:\n" +
          "- package.json\n- Source files\n- Existing documentation\n\n" +
          `Generated by RepoPassport (run: ${runId})`,
      },
      log,
    );

    // Step 8: 保存 PR 记录
    recoveryInfo.failedAt = "pr_record";
    const prRecordId = uuid();
    await savePrRecord(
      {
        id: prRecordId,
        runId,
        platform,
        prUrl: prResult.prUrl,
        targetRepo,
        forkUrl,
        branchName,
        createdAt: new Date().toISOString(),
        status: "open",
        lastCheckedAt: new Date().toISOString(),
      },
      log,
    );

    run.prRecordId = prRecordId;
    run.steps.submit = { status: "completed", completedAt: new Date().toISOString() };
    run.recoveryInfo = undefined;

    console.log(`\n✅ Draft PR 已创建: ${prResult.prUrl}`);
    console.log(`   使用 repopassport status ${prResult.prUrl} 查询状态`);

  } catch (submitErr) {
    const msg = submitErr instanceof Error ? submitErr.message : String(submitErr);
    log.error(`提交失败: ${sanitizeForOutput(msg)}`);

    // 本地清理（只清理本地资源）
    await rollbackLocal(tempDir, branchName, originalBranch, forkUrl, log);

    // 构建恢复信息
    recoveryInfo.recoveryCommands = buildRecoveryCommands(
      recoveryInfo,
      targetRepo,
      cloneResult.meta.defaultBranch,
      branchName,
      forkOwner,
    );

    // 判定失败类型
    const isPartialFailure = recoveryInfo.remoteResources.forkUrl !== undefined ||
      recoveryInfo.remoteResources.remotePushed === true;

    if (isPartialFailure) {
      run.steps.submit = {
        status: "partial_failure",
        error: sanitizeForOutput(msg),
        at: new Date().toISOString(),
      };
      run.recoveryInfo = recoveryInfo;

      console.log("\n⚠️  部分操作已执行，远程资源未删除。恢复信息：");
      console.log(`   失败步骤: ${recoveryInfo.failedAt}`);
      if (recoveryInfo.remoteResources.forkUrl) {
        console.log(`   Fork: ${recoveryInfo.remoteResources.forkUrl}`);
      }
      if (recoveryInfo.remoteResources.branchName) {
        console.log(`   分支: ${recoveryInfo.remoteResources.branchName}`);
      }
      if (recoveryInfo.remoteResources.remotePushed) {
        console.log(`   已 Push 到远程`);
      }
      console.log("\n   恢复命令（请手动执行）：");
      for (const cmd of recoveryInfo.recoveryCommands) {
        console.log(`   ${cmd}`);
      }
    } else {
      run.steps.submit = { status: "failed", error: sanitizeForOutput(msg), at: new Date().toISOString() };
    }
    process.exitCode = 1;
  }

  run.completedAt = new Date().toISOString();
  await saveRun(run, log);
}

/**
 * 本地回滚 — 只清理本地资源，绝不影响远程。
 */
async function rollbackLocal(
  cwd: string,
  branchName: string | undefined,
  originalBranch: string,
  forkUrl: string | undefined,
  log: Logger,
): Promise<void> {
  try {
    if (branchName) {
      try {
        execGit(cwd, `checkout ${originalBranch}`, log);
        execGit(cwd, `branch -D ${branchName}`, log);
      } catch {
        // 分支可能不存在
      }
    }
    if (forkUrl) {
      removeForkRemote(cwd, log);
    }
  } catch {
    log.verbose("本地回滚过程中出现可忽略的错误");
  }
  log.info("本地回滚完成（远端资源未被触碰）");
}

/**
 * 根据失败阶段生成恢复命令。
 */
function buildRecoveryCommands(
  info: SubmitRecoveryInfo,
  targetRepo: string,
  baseBranch: string,
  branchName: string | undefined,
  forkOwner: string | undefined,
): string[] {
  const cmds: string[] = [];

  if (info.failedAt === "push" || info.failedAt === "pr_create" || info.failedAt === "pr_record") {
    // Push 已成功，可以直接创建 PR
    if (info.remoteResources.remotePushed && branchName && forkOwner) {
      cmds.push(
        `# Push 已完成，手动创建 PR（以 GitHub 为例）：\n` +
        `# gh pr create --repo ${targetRepo} --base ${baseBranch} --head ${forkOwner}:${branchName} ` +
        `--title "docs: add English README" --draft`,
      );
    }
  }

  if (info.failedAt === "pr_create" || info.failedAt === "pr_record") {
    // PR 可能已创建但记录未保存
    cmds.push(`# PR 可能已创建但本地记录失败，请在平台页面检查`);
  }

  if (info.failedAt === "fork" && info.remoteResources.forkUrl) {
    cmds.push(
      `# Fork 已创建但后续步骤失败，检查远程 Fork：\n` +
      `# ${info.remoteResources.forkUrl}`,
    );
  }

  return cmds;
}

// ────────────────────────────────────────────
//  辅助函数
// ────────────────────────────────────────────

function createProviderFromOptions(options: PrepareOptions): Provider {
  const providerName = options.provider || "mock";

  if (providerName === "mock") {
    return new MockProvider();
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "未找到 OPENAI_API_KEY 环境变量。\n" +
        "请设置: export OPENAI_API_KEY=sk-...\n" +
        "或使用 Mock Provider: --provider mock",
    );
  }

  const config: ProviderConfig = {
    provider: "openai",
    model: options.model || "gpt-4o-mini",
    apiKey,
    baseURL: process.env["OPENAI_BASE_URL"],
  };

  return createProvider(config);
}

function checkGitAvailable(log: Logger): void {
  try {
    execSync("git --version", { stdio: "pipe" });
    log.verbose("git 可用");
  } catch {
    throw new Error("未找到 git。请安装 git: https://git-scm.com");
  }
}

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

function filterReadmeByEvidence(
  readme: string,
  evidenceMap: ContentEvidenceMap[],
): string {
  const noEvidenceSections = new Set(
    evidenceMap.filter((s) => !s.hasEvidence).map((s) => s.section),
  );

  if (noEvidenceSections.size === 0) return readme;

  const lines = readme.split("\n");
  const filtered: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      const section = h2Match[1].trim();
      if (noEvidenceSections.has(section)) {
        skipping = true;
        continue;
      } else {
        skipping = false;
      }
    }

    if (skipping && line.startsWith("#") && !line.startsWith("## ")) {
      skipping = false;
    }

    if (!skipping) {
      filtered.push(line);
    }
  }

  return filtered.join("\n");
}

/**
 * Dry-run 模式的 y/n/d 交互。
 */
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

/**
 * --submit 模式的确认提示。
 * 必须输入完整的 "SUBMIT owner/repo" 文本才能继续。
 */
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

  const draftId = runId;
  const draftPath = join(baseDir, `${draftId}`);
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

/**
 * 脱敏：将 API Key 和 Token 从错误消息中剔除。
 * 错误消息会输出到终端和日志，必须移除任何可能泄露的凭证。
 */
function sanitizeForOutput(msg: string): string {
  let sanitized = msg;

  // 移除 OPENAI_API_KEY 值
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey && apiKey.length > 4) {
    sanitized = sanitized.replaceAll(apiKey, "***REDACTED***");
  }

  // 移除 GITEE_TOKEN 值
  const giteeToken = process.env["GITEE_TOKEN"];
  if (giteeToken && giteeToken.length > 4) {
    sanitized = sanitized.replaceAll(giteeToken, "***REDACTED***");
  }

  // 移除通用的 Bearer/sk- 模式（防止通过命令行参数传入）
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, "***REDACTED***");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9\-_+.]+/gi, "Bearer ***REDACTED***");

  return sanitized;
}
