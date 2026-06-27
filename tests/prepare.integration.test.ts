import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { cloneRepo } from "../src/repo/clone.js";
import { collectFiles } from "../src/repo/files.js";
import { cleanupTempDir } from "../src/repo/cleanup.js";
import { MockProvider } from "../src/ai/client.js";
import { extractFacts } from "../src/ai/extract.js";
import { generateReadme } from "../src/ai/generate.js";
import { buildContentEvidenceMap, formatEvidenceReport } from "../src/evidence/report.js";
import { showNewFileDiff } from "../src/utils/diff.js";
import { validateRepoFacts } from "../src/validate/facts.js";
import { createLogger } from "../src/utils/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "..", "fixtures", "sample-repo");
const log = createLogger(false);

describe("Dry-run 集成测试 (Mock Provider)", () => {
  let fixtureGitRepo = "";
  let repoUrl = "";

  beforeAll(async () => {
    // 在临时目录创建 git 仓库
    fixtureGitRepo = await mkdtemp(join(tmpdir(), "rp-fixture-"));
    await cp(fixtureDir, fixtureGitRepo, { recursive: true });

    // 初始化 git
    execSync("git init", { cwd: fixtureGitRepo, stdio: "pipe" });
    execSync('git config user.email "test@repopassport.dev"', {
      cwd: fixtureGitRepo,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', {
      cwd: fixtureGitRepo,
      stdio: "pipe",
    });
    execSync("git add -A", { cwd: fixtureGitRepo, stdio: "pipe" });
    execSync('git commit -m "init"', { cwd: fixtureGitRepo, stdio: "pipe" });

    repoUrl = `file://${fixtureGitRepo.replace(/\\/g, "/")}`;
  });

  afterAll(async () => {
    if (fixtureGitRepo && existsSync(fixtureGitRepo)) {
      await rm(fixtureGitRepo, { recursive: true, force: true });
    }
  });

  it("Step 1: 浅克隆本地 fixture 仓库", async () => {
    const result = await cloneRepo(repoUrl, log);
    expect(result.tempDir).toBeDefined();
    expect(result.meta.commitSha).toHaveLength(40);
    expect(result.meta.name).toBeDefined();

    await cleanupTempDir(result.tempDir, log);
  }, 30000);

  it("Step 2: 收集高价值文件", async () => {
    const result = await cloneRepo(repoUrl, log);
    const files = await collectFiles(result.tempDir, log);

    expect(files.length).toBeGreaterThanOrEqual(3);

    const pkg = files.find((f) => f.path.includes("package.json"));
    expect(pkg).toBeDefined();
    expect(pkg!.content).toContain("sample-lib");

    const readme = files.find((f) => f.path.includes("README.md"));
    expect(readme).toBeDefined();

    const srcIndex = files.find((f) => f.path.includes("src/index.ts"));
    expect(srcIndex).toBeDefined();

    await cleanupTempDir(result.tempDir, log);
  }, 30000);

  it("Step 3-4: 事实提取 + 文档生成 (Mock Provider)", async () => {
    const cloneResult = await cloneRepo(repoUrl, log);
    const files = await collectFiles(cloneResult.tempDir, log);
    const provider = new MockProvider();

    const facts = await extractFacts(files, cloneResult.meta, provider, log);
    expect(facts.items.length).toBeGreaterThanOrEqual(3);
    expect(facts.overallConfidence).toBeGreaterThan(0);

    const validation = validateRepoFacts(facts);
    expect(validation.valid).toBe(true);

    for (const item of facts.items) {
      expect(item.evidence.length).toBeGreaterThanOrEqual(1);
      expect(item.combinedConfidence).toBeGreaterThanOrEqual(0);
      expect(item.combinedConfidence).toBeLessThanOrEqual(1);
    }

    const originalReadme = files.find((f) => f.path.includes("README.md"))?.content;
    const generatedReadme = await generateReadme(facts, originalReadme, provider, log);

    expect(generatedReadme).toBeDefined();
    expect(generatedReadme.length).toBeGreaterThan(100);
    expect(generatedReadme).toContain("#");
    expect(generatedReadme.toLowerCase()).toContain("install");

    await cleanupTempDir(cloneResult.tempDir, log);
  }, 30000);

  it("Step 5: 证据报告生成", async () => {
    const cloneResult = await cloneRepo(repoUrl, log);
    const files = await collectFiles(cloneResult.tempDir, log);
    const provider = new MockProvider();
    const facts = await extractFacts(files, cloneResult.meta, provider, log);
    const generatedReadme = await generateReadme(facts, undefined, provider, log);

    const evidenceMap = buildContentEvidenceMap(generatedReadme, facts);
    const report = formatEvidenceReport(facts, evidenceMap);

    expect(report).toContain("证据报告");
    expect(report.length).toBeGreaterThan(200);

    await cleanupTempDir(cloneResult.tempDir, log);
  }, 30000);

  it("Step 6: Diff 预览", async () => {
    const cloneResult = await cloneRepo(repoUrl, log);
    const files = await collectFiles(cloneResult.tempDir, log);
    const provider = new MockProvider();
    const facts = await extractFacts(files, cloneResult.meta, provider, log);
    const generatedReadme = await generateReadme(facts, undefined, provider, log);

    const diff = showNewFileDiff(generatedReadme, "README.en.md");
    expect(diff).toContain("--- a/README.en.md");
    expect(diff).toContain("+++ b/README.en.md");
    expect(diff).toContain("+");

    await cleanupTempDir(cloneResult.tempDir, log);
  }, 30000);

  it("Full Pipeline 闭环验证", async () => {
    const cloneResult = await cloneRepo(repoUrl, log);
    expect(existsSync(cloneResult.tempDir)).toBe(true);

    const files = await collectFiles(cloneResult.tempDir, log);
    expect(files.length).toBeGreaterThanOrEqual(3);

    const provider = new MockProvider();
    const facts = await extractFacts(files, cloneResult.meta, provider, log);
    expect(facts.items.length).toBeGreaterThanOrEqual(3);
    expect(validateRepoFacts(facts).valid).toBe(true);

    const originalReadme = files.find((f) => f.path.includes("README.md"))?.content;
    const generatedReadme = await generateReadme(facts, originalReadme, provider, log);
    expect(generatedReadme.length).toBeGreaterThan(100);

    const evidenceMap = buildContentEvidenceMap(generatedReadme, facts);
    const report = formatEvidenceReport(facts, evidenceMap);
    expect(report).toBeDefined();

    const diff = showNewFileDiff(generatedReadme, "README.en.md");
    expect(diff).toBeDefined();
    expect(diff).toContain("+");

    // 清理
    await cleanupTempDir(cloneResult.tempDir, log);
  }, 60000);
});
