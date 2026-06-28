/**
 * PipelineCoordinator — 事件驱动的仓库分析管线。
 *
 * 不依赖任何终端或 Web 框架。CLI 和 Web 后端各自实现事件处理。
 * 只负责分析阶段（clone → collect → extract → generate → evidence），
 * 交互确认和提交流程由调用方负责。
 */
import { v4 as uuid } from "uuid";
import { execSync } from "node:child_process";
import { cloneRepo, isLocalRepo } from "../repo/clone.js";
import { collectFiles } from "../repo/files.js";
import { createProvider, MockProvider } from "../ai/client.js";
import type { Provider } from "../ai/client.js";
import { extractFacts } from "../ai/extract.js";
import { generateReadme, generateChineseReadme } from "../ai/generate.js";
import { buildContentEvidenceMap } from "../evidence/report.js";
import { detectPlatform } from "../platform/index.js";
import type { PlatformAdapter, PlatformType } from "../platform/index.js";
import { createConsoleLogger } from "../utils/log.js";
import type { Logger } from "../utils/log.js";
import type { ProviderConfig } from "../types/config.js";
import type { RepoFacts, FileContent, RepoMeta } from "../types/facts.js";
import type { ContentEvidenceMap } from "../types/run.js";

// ── 类型 ──

export interface PipelineEvent {
  type: "step:start" | "step:complete" | "step:error" | "progress" | "result";
  step?: "clone" | "extract" | "generate" | "review" | "submit";
  data?: unknown;
  message?: string;
}

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineConfig {
  repoUrl: string;
  provider: "openai" | "mock";
  model?: string;
  onEvent: PipelineEventHandler;
  log?: Logger;
}

export interface PipelineResult {
  runId: string;
  facts: RepoFacts;
  generatedReadme: string;
  filteredReadme: string;
  chineseReadme?: string;
  evidenceMap: ContentEvidenceMap[];
  cloneResult: { tempDir: string; meta: RepoMeta };
  files: FileContent[];
  platform: PlatformType;
  adapter: PlatformAdapter;
  originalReadme?: string;
  detectedLanguages: string[];
}

// ── 管线主函数 ──

/**
 * 运行分析管线。
 * 顺序执行：平台检测 → 前置检查 → 克隆 → 文件收集 → 事实提取 → README 生成 → 证据映射。
 * 每步通过 onEvent 推送进度。
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const log = config.log ?? createConsoleLogger(false);
  const runId = uuid();
  const emit = config.onEvent;

  // ── 0. 平台检测 ──
  const local = isLocalRepo(config.repoUrl);
  let platform: PlatformType;
  let adapter: PlatformAdapter;

  if (local) {
    const { adapter: ghAdapter } = detectPlatform("https://github.com/owner/repo");
    adapter = ghAdapter;
    platform = "github";
    log.info("检测到本地仓库");
  } else {
    ({ adapter } = detectPlatform(config.repoUrl));
    platform = adapter.type;
    log.info(`检测到平台: ${adapter.displayName}`);
  }

  // ── 1. 前置检查 ──
  emit({ type: "step:start", step: "clone", message: "检查前置条件..." });
  checkGitAvailable();
  log.verbose("git 可用");

  // ── 2. 克隆仓库 ──
  emit({ type: "progress", message: "克隆仓库..." });
  const cloneResult = await cloneRepo(config.repoUrl, log);
  emit({
    type: "step:complete",
    step: "clone",
    message: "仓库克隆完成",
    data: { meta: cloneResult.meta },
  });

  // ── 3. 收集文件 ──
  const { files, detectedLanguages } = await collectFiles(cloneResult.tempDir, log);
  emit({ type: "progress", message: `共收集 ${files.length} 个文件 (${detectedLanguages.join(", ")})` });

  const originalReadme = files.find(
    (f) => f.path.endsWith("/README.md") || f.path.endsWith("\\README.md"),
  )?.content;

  // ── 4. 事实提取 ──
  emit({ type: "step:start", step: "extract", message: "AI 分析仓库..." });
  const provider = createProviderFromConfig(config);
  const facts = await extractFacts(files, cloneResult.meta, provider, log, detectedLanguages);
  emit({
    type: "step:complete",
    step: "extract",
    message: `事实提取完成: ${facts.items.length} 项`,
  });

  // ── 5. README 生成 ──
  emit({ type: "step:start", step: "generate", message: "生成 README..." });

  let chineseReadme: string | undefined;
  if (!originalReadme) {
    chineseReadme = await generateChineseReadme(facts, provider, log, detectedLanguages);
  }

  const generatedReadme = await generateReadme(facts, originalReadme, provider, log, detectedLanguages);
  emit({
    type: "step:complete",
    step: "generate",
    message: "README 生成完成",
  });

  // ── 6. 证据映射 ──
  emit({ type: "step:start", step: "review", message: "构建证据映射..." });
  const evidenceMap = buildContentEvidenceMap(generatedReadme, facts);
  const filteredReadme = filterReadmeByEvidence(generatedReadme, evidenceMap);
  emit({
    type: "step:complete",
    step: "review",
    message: "审查完成",
  });

  const result: PipelineResult = {
    runId,
    facts,
    generatedReadme,
    filteredReadme,
    chineseReadme,
    evidenceMap,
    cloneResult,
    files,
    platform,
    adapter,
    originalReadme,
    detectedLanguages,
  };

  emit({ type: "result", data: result });

  return result;
}

// ── 辅助函数 ──

function checkGitAvailable(): void {
  try {
    execSync("git --version", { stdio: "pipe" });
  } catch {
    throw new Error("未找到 git。请安装 git: https://git-scm.com");
  }
}

function createProviderFromConfig(config: PipelineConfig): Provider {
  if (config.provider === "mock") {
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

  const providerConfig: ProviderConfig = {
    provider: "openai",
    model: config.model || process.env["OPENAI_MODEL"] || "gpt-4o-mini",
    apiKey,
    baseURL: process.env["OPENAI_BASE_URL"],
  };

  return createProvider(providerConfig);
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
