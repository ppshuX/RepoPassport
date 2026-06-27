import { validateGitHubUrl, cloneRepo } from "../repo/clone.js";
import { cleanupTempDir } from "../repo/cleanup.js";
import { collectFiles } from "../repo/files.js";
import { createProvider, MockProvider } from "../ai/client.js";
import { extractFacts } from "../ai/extract.js";
import { generateReadme } from "../ai/generate.js";
import { buildContentEvidenceMap, formatEvidenceReport } from "../evidence/report.js";
import { showNewFileDiff, showDiff } from "../utils/diff.js";
import { createLogger } from "../utils/log.js";
import { forkRepo } from "../pr/fork.js";
import { createDraftPr } from "../pr/create.js";
import { addForkRemote, removeForkRemote, createBranch, currentBranch, defaultBranch, stageFile, commit, pushBranch, } from "../pr/git.js";
import { saveRun, savePrRecord } from "../store/runs.js";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
/**
 * prepare 命令主流程。
 */
export async function prepareCommand(repoUrl, options) {
    const log = createLogger(options.verbose);
    const runId = uuid();
    // 记录运行
    const run = {
        id: runId,
        repoUrl,
        startedAt: new Date().toISOString(),
        steps: {
            clone: { status: "pending" },
            extract: { status: "pending" },
            generate: { status: "pending" },
            review: { status: "pending" },
            submit: { status: "skipped" },
        },
    };
    let tempDir;
    try {
        // ── 0. 前置检查 ──
        log.info("检查前置条件...");
        // 校验 URL
        if (!validateGitHubUrl(repoUrl)) {
            throw new Error(`无效的 GitHub URL: ${repoUrl}\n格式: https://github.com/owner/repo`);
        }
        // 检查 git 可用
        checkGitAvailable(log);
        // 检查 gh CLI（dry-run 模式下不强制）
        if (!options.dryRun) {
            checkGhAvailable(log);
        }
        // ── 1. 克隆与分析 ──
        run.steps.clone = { status: "running", startedAt: new Date().toISOString() };
        const cloneResult = await cloneRepo(repoUrl, log);
        tempDir = cloneResult.tempDir;
        run.steps.clone = { status: "completed", completedAt: new Date().toISOString() };
        // 收集文件
        const files = await collectFiles(tempDir, log);
        log.info(`共收集 ${files.length} 个文件`);
        // 读取原始 README（若存在）
        const originalReadme = files.find((f) => f.path.endsWith("/README.md") || f.path.endsWith("\\README.md"))?.content;
        // ── 2. 事实提取 ──
        run.steps.extract = { status: "running", startedAt: new Date().toISOString() };
        const provider = createProviderFromOptions(options);
        const facts = await extractFacts(files, cloneResult.meta, provider, log);
        run.steps.extract = { status: "completed", completedAt: new Date().toISOString() };
        // ── 3. 文档生成 ──
        run.steps.generate = { status: "running", startedAt: new Date().toISOString() };
        const generatedReadme = await generateReadme(facts, originalReadme, provider, log);
        run.steps.generate = { status: "completed", completedAt: new Date().toISOString() };
        // ── 4. 构建内容证据映射 ──
        const contentEvidenceMap = buildContentEvidenceMap(generatedReadme, facts);
        // 过滤无证据章节
        const filteredReadme = filterReadmeByEvidence(generatedReadme, contentEvidenceMap);
        // ── 5. 展示审核界面 ──
        run.steps.review = { status: "running", startedAt: new Date().toISOString() };
        console.log("\n" + "═".repeat(72));
        console.log("  RepoPassport — 英文 README 草稿");
        console.log("═".repeat(72));
        console.log(`  仓库: ${cloneResult.meta.owner}/${cloneResult.meta.name}`);
        console.log(`  Commit: ${cloneResult.meta.commitSha.slice(0, 7)}`);
        console.log(`  Provider: ${options.provider}`);
        console.log(`  模式: ${options.dryRun ? "Dry-run (不执行 Git 操作)" : "正式模式"}`);
        console.log("═".repeat(72));
        // 读取英文文档命名约定
        const existingEnReadme = detectEnglishReadme(files);
        // 显示 Diff
        console.log("\n── Diff 预览 ──\n");
        if (existingEnReadme) {
            console.log(showDiff(existingEnReadme.content, filteredReadme, existingEnReadme.path));
        }
        else {
            console.log(showNewFileDiff(filteredReadme, "README.en.md"));
        }
        // 显示证据报告
        console.log("\n" + formatEvidenceReport(facts, contentEvidenceMap));
        // ── 6. 交互式确认 ──
        const choice = await promptUser();
        if (choice === "n") {
            console.log("\n已取消，清理中...");
            run.steps.review = { status: "skipped" };
            run.completedAt = new Date().toISOString();
            await saveRun(run, log);
        }
        else if (choice === "d") {
            // 仅保存草稿
            const draftPath = await saveDraftLocally(runId, cloneResult.meta, filteredReadme, facts, contentEvidenceMap, log);
            console.log(`\n草稿已保存: ${draftPath}`);
            run.draftId = runId;
            run.steps.review = { status: "completed", completedAt: new Date().toISOString() };
            run.completedAt = new Date().toISOString();
            await saveRun(run, log);
        }
        else if (choice === "y") {
            // 确认
            if (options.dryRun) {
                const draftPath = await saveDraftLocally(runId, cloneResult.meta, filteredReadme, facts, contentEvidenceMap, log);
                console.log(`\n[Dry-run] 草稿已保存: ${draftPath}`);
                console.log("[Dry-run] 未执行任何 Git 操作、未创建 Fork 或 PR。");
                run.draftId = runId;
                run.steps.review = { status: "completed", completedAt: new Date().toISOString() };
                run.steps.submit = { status: "skipped" };
            }
            else {
                // ── 正式模式：Fork + Commit + Draft PR ──
                run.steps.submit = { status: "running", startedAt: new Date().toISOString() };
                // 先存草稿
                await saveDraftLocally(runId, cloneResult.meta, filteredReadme, facts, contentEvidenceMap, log);
                run.draftId = runId;
                // 确定文件名
                const existingEn = detectEnglishReadme(files);
                const englishReadmeName = existingEn
                    ? basename(existingEn.path)
                    : "README.en.md";
                // 在临时克隆目录中写入英文 README
                const targetPath = join(tempDir, englishReadmeName);
                await writeFile(targetPath, filteredReadme, "utf-8");
                let forkUrl;
                let forkOwner;
                let branchName;
                const originalBranch = defaultBranch(tempDir, log);
                try {
                    // Step 1: Fork
                    log.info("── Fork 仓库 ──");
                    const forkResult = await forkRepo(cloneResult.meta.owner, cloneResult.meta.name, log);
                    forkUrl = forkResult.forkUrl;
                    forkOwner = forkResult.forkOwner;
                    // Step 2: 添加 remote
                    log.info("── 添加 Fork Remote ──");
                    addForkRemote(tempDir, forkResult.forkUrl, log);
                    // Step 3: 创建分支
                    log.info("── 创建分支 ──");
                    createBranch(tempDir, "repopassport/en-readme", log);
                    branchName = currentBranch(tempDir, log);
                    // Step 4: Stage
                    log.info("── Stage 文件 ──");
                    stageFile(tempDir, englishReadmeName, log);
                    // Step 5: Commit
                    log.info("── Commit ──");
                    commit(tempDir, "docs: add English README", "AI-assisted English README generation. Human-reviewed before submission.\n\n" +
                        "Evidence extracted from:\n" +
                        "- package.json\n" +
                        "- Source files\n" +
                        "- Existing documentation\n\n" +
                        `Generated by RepoPassport (run: ${runId})`, log);
                    // Step 6: Push
                    log.info("── Push 到 Fork ──");
                    pushBranch(tempDir, "repopassport-fork", branchName, log);
                    // Step 7: 创建 Draft PR
                    log.info("── 创建 Draft PR ──");
                    const prResult = await createDraftPr(cloneResult.meta.owner, cloneResult.meta.name, cloneResult.meta.defaultBranch, forkOwner, branchName, "docs: add English README", "## Summary\n\n" +
                        "AI-assisted English README generation. Human-reviewed before submission.\n\n" +
                        "## What Changed\n\n" +
                        `- Added ${englishReadmeName} (English README)\n` +
                        "- Original Chinese README.md preserved\n\n" +
                        "Evidence extracted from:\n" +
                        "- package.json\n" +
                        "- Source files\n" +
                        "- Existing documentation\n\n" +
                        `Generated by RepoPassport (run: ${runId})`, log);
                    const prRecordId = uuid();
                    // Step 8: 保存 PR 记录
                    await savePrRecord({
                        id: prRecordId,
                        runId,
                        prUrl: prResult.prUrl,
                        targetRepo: `${cloneResult.meta.owner}/${cloneResult.meta.name}`,
                        forkUrl,
                        branchName,
                        createdAt: new Date().toISOString(),
                        status: "open",
                        lastCheckedAt: new Date().toISOString(),
                    }, log);
                    run.prRecordId = prRecordId;
                    run.steps.submit = {
                        status: "completed",
                        completedAt: new Date().toISOString(),
                    };
                    console.log(`\n✅ Draft PR 已创建: ${prResult.prUrl}`);
                    console.log(`   使用 repopassport status ${prResult.prUrl} 查询状态`);
                }
                catch (submitErr) {
                    // 回滚
                    const msg = submitErr instanceof Error
                        ? submitErr.message
                        : String(submitErr);
                    log.error(`提交失败: ${msg}`);
                    // 按步骤回滚
                    await rollbackSubmit(tempDir, forkUrl, branchName, originalBranch, log);
                    run.steps.submit = {
                        status: "failed",
                        error: msg,
                        at: new Date().toISOString(),
                    };
                    process.exitCode = 1;
                }
            }
            run.completedAt = new Date().toISOString();
            await saveRun(run, log);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(msg);
        // 记录到运行步骤
        const ts = new Date().toISOString();
        for (const key of ["clone", "extract", "generate", "review"]) {
            if (run.steps[key].status === "running") {
                run.steps[key] = { status: "failed", error: msg, at: ts };
            }
        }
        run.completedAt = ts;
        try {
            await saveRun(run, log);
        }
        catch {
            // 保存失败不阻塞
        }
        process.exitCode = 1;
    }
    finally {
        // 清理临时目录
        if (tempDir) {
            await cleanupTempDir(tempDir, log);
        }
    }
}
/**
 * 从命令行选项创建 Provider。
 */
function createProviderFromOptions(options) {
    const providerName = options.provider || "mock";
    if (providerName === "mock") {
        return new MockProvider();
    }
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
        throw new Error("未找到 OPENAI_API_KEY 环境变量。\n" +
            "请设置: export OPENAI_API_KEY=sk-...\n" +
            "或使用 Mock Provider: --provider mock");
    }
    const config = {
        provider: "openai",
        model: options.model || "gpt-4o-mini",
        apiKey,
        baseURL: process.env["OPENAI_BASE_URL"],
    };
    return createProvider(config);
}
/**
 * 检查 git 是否可用。
 */
function checkGitAvailable(log) {
    try {
        execSync("git --version", { stdio: "pipe" });
        log.verbose("git 可用");
    }
    catch {
        throw new Error("未找到 git。请安装 git: https://git-scm.com");
    }
}
/**
 * 检查 gh CLI 是否可用并已登录。
 */
function checkGhAvailable(log) {
    try {
        execSync("gh --version", { stdio: "pipe" });
        log.verbose("gh CLI 可用");
        try {
            execSync("gh auth status", { stdio: "pipe" });
            log.verbose("gh 已登录");
        }
        catch {
            throw new Error("gh CLI 未登录。请运行: gh auth login");
        }
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("未登录"))
            throw err;
        throw new Error("未找到 GitHub CLI (gh)。请安装: https://cli.github.com\n或使用 --dry-run 模式。");
    }
}
/**
 * 检测仓库中已有的英文 README 文件。
 */
function detectEnglishReadme(files) {
    const patterns = [/README\.en\.md/i, /README_EN\.md/i, /README-en\.md/i];
    for (const f of files) {
        const name = f.path.split(/[/\\]/).pop() || "";
        if (patterns.some((p) => p.test(name))) {
            return f;
        }
    }
    return null;
}
/**
 * 过滤无证据支持的章节。
 */
function filterReadmeByEvidence(readme, evidenceMap) {
    // 找出无证据的章节标题
    const noEvidenceSections = new Set(evidenceMap.filter((s) => !s.hasEvidence).map((s) => s.section));
    if (noEvidenceSections.size === 0)
        return readme;
    const lines = readme.split("\n");
    const filtered = [];
    let skipping = false;
    for (const line of lines) {
        const h2Match = line.match(/^## (.+)/);
        if (h2Match) {
            const section = h2Match[1].trim();
            if (noEvidenceSections.has(section)) {
                skipping = true;
                continue;
            }
            else {
                skipping = false;
            }
        }
        if (skipping && line.startsWith("#") && !line.startsWith("## ")) {
            // 遇到更高层级的标题，不再跳过
            skipping = false;
        }
        if (!skipping) {
            filtered.push(line);
        }
    }
    return filtered.join("\n");
}
/**
 * 终端交互：等待用户选择。
 */
function promptUser() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        console.log("\n选项:");
        console.log("  [y] 确认");
        console.log("  [n] 放弃，清理临时文件");
        console.log("  [d] 仅保存草稿到本地");
        console.log("");
        rl.question("请选择 [y/n/d]: ", (answer) => {
            rl.close();
            const choice = answer.trim().toLowerCase();
            if (choice === "y" || choice === "yes")
                resolve("y");
            else if (choice === "n" || choice === "no")
                resolve("n");
            else if (choice === "d")
                resolve("d");
            else {
                console.log("无效选择，默认放弃。");
                resolve("n");
            }
        });
    });
}
/**
 * 保存文档草稿和证据到本地。
 */
async function saveDraftLocally(runId, _repoMeta, generatedReadme, facts, evidenceMap, log) {
    const baseDir = join(homedir(), ".repopassport", "drafts");
    await mkdir(baseDir, { recursive: true });
    const draftId = runId;
    const draftPath = join(baseDir, `${draftId}`);
    await mkdir(draftPath, { recursive: true });
    // 保存 README.en.md
    await writeFile(join(draftPath, "README.en.md"), generatedReadme, "utf-8");
    // 保存 facts JSON
    await writeFile(join(draftPath, "facts.json"), JSON.stringify(facts, null, 2), "utf-8");
    // 保存证据映射
    await writeFile(join(draftPath, "evidence.json"), JSON.stringify(evidenceMap, null, 2), "utf-8");
    log.info(`草稿已保存至: ${draftPath}`);
    return draftPath;
}
/**
 * 提交失败时回滚。
 */
async function rollbackSubmit(cwd, forkUrl, branchName, originalBranch, log) {
    try {
        if (branchName) {
            try {
                const { execGit } = await import("../pr/git.js");
                execGit(cwd, `checkout ${originalBranch}`, log);
                execGit(cwd, `branch -D ${branchName}`, log);
            }
            catch {
                // 忽略
            }
        }
        if (forkUrl) {
            removeForkRemote(cwd, log);
        }
    }
    catch {
        log.verbose("回滚过程中出现忽略的错误");
    }
    log.info("已执行回滚操作");
}
//# sourceMappingURL=prepare.js.map