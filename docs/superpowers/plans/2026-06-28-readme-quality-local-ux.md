# README Quality and Local UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce more useful and natural evidence-backed READMEs while making the local CLI work with one command, real-provider auto-detection, style presets, explicit output, editor opening, and in-process regeneration.

**Architecture:** Keep fact extraction and factual README generation authoritative, then add an isolated `polishReadme()` pass whose output is accepted only when protected Markdown fragments remain unchanged. Resolve non-secret local settings before provider creation, keep API keys in environment variables, and move local output/review helpers out of the already-large `prepare.ts` before integrating a regeneration loop that reuses RepoFacts.

**Tech Stack:** Node.js 18+, TypeScript 5.8, Commander 13, Zod 3, Vitest 3, native `fetch`, `fs/promises`, and `child_process.execFile`.

## Global Constraints

- Begin execution only after the current dirty safety/local-output work is committed or otherwise preserved; do not overwrite changes presently touching `src/commands/prepare.ts`, platform adapters, Git helpers, repository validation, or safety/status tests.
- Use an isolated Git worktree for implementation because the primary workspace currently contains unrelated edits.
- API keys remain environment-only and must never be written to `~/.repopassport/config.json`, drafts, logs, fixtures, snapshots, or commits.
- Mock generation is allowed only when the user explicitly passes `--provider mock`; no silent Mock fallback is permitted.
- Preserve the existing `--submit` confirmation boundary. Automated tests must never create a real fork, branch, push, PR, or MR.
- Supported styles are exactly `professional`, `balanced`, and `friendly`; `balanced` is the default.
- Do not add runtime dependencies. Use existing libraries and Node built-ins.
- Each task follows TDD: add a focused failing test, run it and observe the expected failure, add minimal implementation, rerun focused and relevant suites, then commit.
- Execution baseline must satisfy `npm run typecheck` and `npm test` with 60/60 tests passing before Task 1 starts.

## File Structure

### New files

- `src/config/settings.ts` — load non-secret local configuration and resolve Provider/style/output settings.
- `src/ai/polish.ts` — style instructions, protected-fragment validation, and fallback-safe README polishing.
- `src/cli.ts` — construct a testable Commander program without executing it on import.
- `src/output/files.ts` — resolve/write explicit output files and open a saved file without shell interpolation.
- `src/evidence/filter.ts` — remove generated sections that have no evidence.
- `src/commands/draft.ts` — produce an English/optional Chinese draft bundle from cached RepoFacts.
- `src/commands/review.ts` — parse and prompt for save/regenerate/edit/quit review actions.
- `tests/config.test.ts`, `tests/polish.test.ts`, `tests/generate.test.ts`, `tests/cli.test.ts`, `tests/output.test.ts`, `tests/draft.test.ts`, `tests/review.test.ts` — focused unit tests.
- `docs/testing/readme-quality-scorecard.md` — repeatable manual quality scoring sheet.

### Modified files

- `src/types/config.ts` — add style and local/CLI option types; make Provider selection optional at the CLI boundary.
- `src/ai/generate.ts` — strengthen factual draft instructions and export prompt builders for direct tests.
- `src/ai/client.ts` — make Mock distinguish extraction, factual generation, Chinese generation, and polishing.
- `src/index.ts` — delegate program construction to `src/cli.ts` and call `parseAsync()`.
- `src/commands/prepare.ts` — use resolved settings, draft bundles, review loop, explicit output, and editor opening.
- `tests/prepare.integration.test.ts` — cover cached regeneration and final-output behavior.
- `docs/testing/e2e-checklist.md` — document real-provider setup, styles, output, editor opening, and quality sampling.

---

### Task 1: Resolve styles and non-secret local settings

**Files:**
- Modify: `src/types/config.ts`
- Create: `src/config/settings.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `process.env`, optional CLI `PrepareOptions`, and optional `~/.repopassport/config.json`.
- Produces: `WritingStyle`, `LocalConfig`, `ResolvedSettings`, `loadLocalConfig()`, and `resolveSettings()` for CLI and prepare orchestration.

- [ ] **Step 1: Write the failing settings tests**

Create `tests/config.test.ts` with explicit precedence, defaults, invalid-config, and missing-key cases:

```ts
import { describe, expect, it } from "vitest";
import { loadLocalConfig, resolveSettings } from "../src/config/settings.js";

describe("resolveSettings", () => {
  it("uses explicit mock only when requested on the CLI", () => {
    const resolved = resolveSettings(
      { provider: "mock", style: "friendly" },
      {},
      { provider: "openai", model: "configured-model", style: "professional" },
    );
    expect(resolved).toMatchObject({ provider: "mock", model: "mock", style: "friendly" });
  });

  it("prefers CLI, then local config, then environment defaults", () => {
    const resolved = resolveSettings(
      { model: "cli-model" },
      { OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "https://env.example/v1" },
      { provider: "openai", model: "config-model", baseURL: "https://config.example/v1", style: "professional" },
    );
    expect(resolved).toEqual({
      provider: "openai",
      model: "cli-model",
      apiKey: "secret",
      baseURL: "https://config.example/v1",
      style: "professional",
      outputDir: undefined,
    });
  });

  it("auto-selects OpenAI and balanced style when only OPENAI_API_KEY exists", () => {
    expect(resolveSettings({}, { OPENAI_API_KEY: "secret" }, {})).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      style: "balanced",
      apiKey: "secret",
    });
  });

  it("does not silently fall back to Mock", () => {
    expect(() => resolveSettings({}, {}, {})).toThrow(/OPENAI_API_KEY/);
  });
});

describe("loadLocalConfig", () => {
  it("returns an empty config when the file does not exist", async () => {
    await expect(loadLocalConfig("Z:/definitely-missing/repopassport.json")).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/config.test.ts`

Expected: FAIL because `src/config/settings.ts` does not exist.

- [ ] **Step 3: Add exact configuration types**

Replace `src/types/config.ts` with:

```ts
import type { PlatformType } from "../platform/index.js";

export type WritingStyle = "professional" | "balanced" | "friendly";
export type ProviderName = "openai" | "mock";

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface PrepareOptions {
  provider?: ProviderName;
  model?: string;
  style?: WritingStyle;
  submit: boolean;
  output?: string;
  open: boolean;
  verbose: boolean;
  platform?: PlatformType;
}

export interface LocalConfig {
  provider?: "openai";
  model?: string;
  baseURL?: string;
  style?: WritingStyle;
  outputDir?: string;
}

export interface ResolvedSettings {
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseURL?: string;
  style: WritingStyle;
  outputDir?: string;
}
```

- [ ] **Step 4: Implement settings loading and precedence**

Create `src/config/settings.ts`:

```ts
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { LocalConfig, PrepareOptions, ResolvedSettings } from "../types/config.js";

const LocalConfigSchema = z.object({
  provider: z.literal("openai").optional(),
  model: z.string().min(1).optional(),
  baseURL: z.string().url().optional(),
  style: z.enum(["professional", "balanced", "friendly"]).optional(),
  outputDir: z.string().min(1).optional(),
}).strict();

export async function loadLocalConfig(
  path = join(homedir(), ".repopassport", "config.json"),
): Promise<LocalConfig> {
  try {
    const raw = JSON.parse(await readFile(path, "utf-8")) as unknown;
    return LocalConfigSchema.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`无法读取 RepoPassport 配置: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function resolveSettings(
  cli: Pick<PrepareOptions, "provider" | "model" | "style">,
  env: NodeJS.ProcessEnv = process.env,
  local: LocalConfig = {},
): ResolvedSettings {
  if (cli.provider === "mock") {
    return {
      provider: "mock",
      model: "mock",
      apiKey: "",
      style: cli.style ?? local.style ?? "balanced",
      outputDir: local.outputDir,
    };
  }

  const provider = cli.provider ?? local.provider ?? (env.OPENAI_API_KEY ? "openai" : undefined);
  if (provider !== "openai" || !env.OPENAI_API_KEY) {
    throw new Error(
      "未配置真实 AI Provider。请设置 OPENAI_API_KEY，或仅在测试时显式使用 --provider mock。",
    );
  }

  return {
    provider,
    model: cli.model ?? local.model ?? "gpt-4o-mini",
    apiKey: env.OPENAI_API_KEY,
    baseURL: local.baseURL ?? env.OPENAI_BASE_URL,
    style: cli.style ?? local.style ?? "balanced",
    outputDir: local.outputDir,
  };
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run tests/config.test.ts && npm run typecheck`

Expected: configuration tests PASS and TypeScript reports zero errors. If existing callers fail because `PrepareOptions.provider` became optional or `open` became required, update test fixtures to set `open: false`; do not restore a Mock default.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/types/config.ts src/config/settings.ts tests/config.test.ts
git commit -m "feat: resolve README generation settings"
```

---

### Task 2: Add fallback-safe README polishing

**Files:**
- Create: `src/ai/polish.ts`
- Modify: `src/ai/client.ts`
- Test: `tests/polish.test.ts`

**Interfaces:**
- Consumes: `Provider`, `RepoFacts`, `Logger`, `WritingStyle`, source Markdown, and `"en" | "zh"`.
- Produces: `polishReadme(source, facts, provider, style, language, log): Promise<string>` and `validatePolishedReadme(source, candidate)`.

- [ ] **Step 1: Write failing validation and fallback tests**

Create `tests/polish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Provider } from "../src/ai/client.js";
import { polishReadme, validatePolishedReadme } from "../src/ai/polish.js";
import type { RepoFacts } from "../src/types/facts.js";

const source = "# Demo\n\n## Quick Start\n\n```bash\nnpm install demo\n```\n\nUse `run()` to start.";
const facts = { repo: { owner: "o", name: "demo", url: "https://github.com/o/demo", defaultBranch: "main", commitSha: "a".repeat(40) }, analyzedAt: new Date().toISOString(), items: [], overallConfidence: 1 } satisfies RepoFacts;
const log = { info() {}, warn() {}, error() {}, verbose() {} };

class StubProvider implements Provider {
  constructor(private readonly result: string | Error) {}
  async chatCompletion() {
    if (this.result instanceof Error) throw this.result;
    return { content: this.result };
  }
}

describe("validatePolishedReadme", () => {
  it("accepts prose changes that preserve protected fragments", () => {
    const candidate = source.replace("# Demo", "# Demo — Start quickly");
    expect(validatePolishedReadme(source, candidate)).toEqual({ valid: true });
  });

  it("rejects changed commands and unbalanced fences", () => {
    expect(validatePolishedReadme(source, source.replace("npm install demo", "npm install invented"))).toMatchObject({ valid: false });
    expect(validatePolishedReadme(source, source + "\n```")).toMatchObject({ valid: false });
  });
});

describe("polishReadme", () => {
  it("returns the polished README when validation passes", async () => {
    const candidate = source.replace("# Demo", "# Demo — A friendlier start");
    await expect(polishReadme(source, facts, new StubProvider(candidate), "balanced", "en", log)).resolves.toBe(candidate);
  });

  it("falls back to the factual README on provider or validation failure", async () => {
    await expect(polishReadme(source, facts, new StubProvider(new Error("timeout")), "balanced", "en", log)).resolves.toBe(source);
    await expect(polishReadme(source, facts, new StubProvider(source.replace("run()", "invented()")), "balanced", "en", log)).resolves.toBe(source);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/polish.test.ts`

Expected: FAIL because `src/ai/polish.ts` does not exist.

- [ ] **Step 3: Implement style instructions and protected-fragment validation**

Create `src/ai/polish.ts` with these public functions and exact invariants:

```ts
import type { Provider } from "./client.js";
import type { RepoFacts } from "../types/facts.js";
import type { WritingStyle } from "../types/config.js";
import type { Logger } from "../utils/log.js";

const STYLE_RULES: Record<WritingStyle, string> = {
  professional: "Use a restrained, formal, direct tone. Prefer precision over personality.",
  balanced: "Prioritize practical guidance, add measured enthusiasm, and allow at most two natural light touches in descriptive prose.",
  friendly: "Use a warm, welcoming, guiding tone without hype, slang, memes, or forced jokes.",
};

function protectedFragments(markdown: string): string[] {
  const blocks = markdown.match(/```[\s\S]*?```/g) ?? [];
  const withoutBlocks = markdown.replace(/```[\s\S]*?```/g, "");
  const inline = withoutBlocks.match(/`[^`\n]+`/g) ?? [];
  return [...blocks, ...inline].sort();
}

export function validatePolishedReadme(
  source: string,
  candidate: string,
): { valid: true } | { valid: false; reason: string } {
  if (!candidate.trim()) return { valid: false, reason: "润色结果为空" };
  if ((candidate.match(/```/g)?.length ?? 0) % 2 !== 0) {
    return { valid: false, reason: "Markdown 代码围栏不完整" };
  }
  if (JSON.stringify(protectedFragments(source)) !== JSON.stringify(protectedFragments(candidate))) {
    return { valid: false, reason: "代码块、命令或 API 签名发生变化" };
  }
  return { valid: true };
}

export async function polishReadme(
  source: string,
  facts: RepoFacts,
  provider: Provider,
  style: WritingStyle,
  language: "en" | "zh",
  log: Logger,
): Promise<string> {
  const system = `You are a README editor. Improve structure, clarity, practical usefulness, warmth, and natural flow without adding facts.\n
Rules:\n
- Never add features, commands, APIs, configuration, performance claims, licenses, or requirements.\n
- Preserve every fenced code block and inline-code fragment exactly.\n
- Keep warnings and prerequisites.\n
- Avoid hype such as revolutionary, ultimate, amazing, or powerful unless directly evidenced.\n
- Humor is allowed only in descriptive prose and never in commands, APIs, warnings, or configuration.\n
- Output only Markdown.\n
Style: ${STYLE_RULES[style]}\n
Language: ${language === "zh" ? "Chinese" : "English"}.`;
  const user = `Repository: ${facts.repo.owner}/${facts.repo.name}\n\nRewrite this factual README without changing its technical content:\n\n${source}`;

  try {
    const response = await provider.chatCompletion([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const candidate = response.content.trim();
    const validation = validatePolishedReadme(source, candidate);
    if (!validation.valid) {
      log.warn(`润色结果未通过校验，使用事实版 README: ${validation.reason}`);
      return source;
    }
    return candidate;
  } catch {
    // Provider errors are sanitized at the command boundary. Do not echo a raw
    // response here because compatible providers may include credentials in it.
    log.warn("README 润色失败，使用事实版 README");
    return source;
  }
}
```

- [ ] **Step 4: Teach MockProvider to recognize the polishing call**

In `src/ai/client.ts`, add the polishing branch before the existing `technical writer` branch so tests do not accidentally receive a factual Mock README:

```ts
if (systemContent.includes("You are a README editor")) {
  const userContent = messages.find((m) => m.role === "user")?.content ?? "";
  const marker = "Rewrite this factual README without changing its technical content:\n\n";
  return { content: userContent.split(marker)[1] ?? "" };
}
```

- [ ] **Step 5: Run focused tests and the existing integration test**

Run: `npx vitest run tests/polish.test.ts tests/prepare.integration.test.ts && npm run typecheck`

Expected: both files PASS and typecheck reports zero errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/ai/polish.ts src/ai/client.ts tests/polish.test.ts
git commit -m "feat: add evidence-safe README polishing"
```

---

### Task 3: Strengthen factual README prompts

**Files:**
- Modify: `src/ai/generate.ts`
- Test: `tests/generate.test.ts`

**Interfaces:**
- Consumes: existing `RepoFacts`, optional original README, and `Provider`.
- Produces: unchanged `generateReadme()` and `generateChineseReadme()` behavior plus exported prompt builders for deterministic tests.

- [ ] **Step 1: Write tests for the factual quality contract**

Create `tests/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildChineseGenerateSystemPrompt, buildGenerateSystemPrompt } from "../src/ai/generate.js";

describe("factual README prompts", () => {
  it("prioritizes reader value and practical quick starts in English", () => {
    const prompt = buildGenerateSystemPrompt();
    expect(prompt).toContain("what the project is, what problem it solves, and who it is for");
    expect(prompt).toContain("Quick Start");
    expect(prompt).toContain("Do not add content merely to fill a template");
  });

  it("applies the same factual contract in Chinese", () => {
    const prompt = buildChineseGenerateSystemPrompt();
    expect(prompt).toContain("项目是什么、解决什么问题、适合谁");
    expect(prompt).toContain("快速开始");
    expect(prompt).toContain("不要为了填满模板而补充内容");
  });
});
```

- [ ] **Step 2: Run the test and verify private builders cause failure**

Run: `npx vitest run tests/generate.test.ts`

Expected: FAIL because the prompt builders are not exported and do not yet contain the quality contract.

- [ ] **Step 3: Export and extend both system prompt builders**

In `src/ai/generate.ts`, export `buildGenerateSystemPrompt()` and `buildChineseGenerateSystemPrompt()`. Add these rules immediately before each prompt's output-only rule:

```text
10. Open by answering what the project is, what problem it solves, and who it is for, but only when those facts exist.
11. Prefer a copyable Quick Start that reaches the smallest evidenced useful result.
12. Describe evidenced user benefits instead of repeating dependency names.
13. Avoid hype, filler, generic praise, and obvious AI phrasing.
14. Do not add content merely to fill a template; a short reliable README is better.
```

Use the equivalent exact Chinese rules in the Chinese prompt:

```text
10. 开头优先回答项目是什么、解决什么问题、适合谁，但仅限 RepoFacts 有相关证据时。
11. 优先提供可复制的“快速开始”，达到证据支持的最小可用结果。
12. 描述有证据的用户收益，不要只重复依赖名称。
13. 避免夸张宣传、填充文字、空泛赞美和明显的 AI 腔。
14. 不要为了填满模板而补充内容；短而可靠优于长而空泛。
```

Add `## Quick Start` / `## 快速开始` to the template before the longer Usage section and retain the rule that unsupported sections are omitted.

- [ ] **Step 4: Run focused tests and existing generation integration**

Run: `npx vitest run tests/generate.test.ts tests/prepare.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/ai/generate.ts tests/generate.test.ts
git commit -m "feat: improve factual README guidance"
```

---

### Task 4: Make the CLI testable and default to the current repository

**Files:**
- Create: `src/cli.ts`
- Modify: `src/index.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: injectable `prepareCommand` and `statusCommand` functions.
- Produces: `createProgram(deps?)`, optional `[repo-url]`, `--style`, `--open`, and no Provider default.

- [ ] **Step 1: Write failing CLI parsing tests**

Create `tests/cli.test.ts` with spies that receive normalized arguments without running repository operations:

```ts
import { describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";

describe("prepare CLI", () => {
  it("uses the current directory and leaves provider unresolved", async () => {
    const prepare = vi.fn(async () => {});
    const program = createProgram({ prepare, status: vi.fn(async () => {}) });
    await program.parseAsync(["node", "repopassport", "prepare"]);
    expect(prepare).toHaveBeenCalledWith(".", expect.objectContaining({
      provider: undefined,
      style: undefined,
      open: false,
      submit: false,
    }));
  });

  it("accepts a style, output path, and editor opening", async () => {
    const prepare = vi.fn(async () => {});
    const program = createProgram({ prepare, status: vi.fn(async () => {}) });
    await program.parseAsync(["node", "repopassport", "prepare", ".", "--style", "friendly", "--output", "README.md", "--open"]);
    expect(prepare).toHaveBeenCalledWith(".", expect.objectContaining({ style: "friendly", output: "README.md", open: true }));
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/cli.test.ts`

Expected: FAIL because `src/cli.ts` does not exist.

- [ ] **Step 3: Implement the program factory**

Create `src/cli.ts`. Use Commander `Option.choices()` with the exact Provider values `openai|mock` and style values `professional|balanced|friendly` so invalid values fail before orchestration:

```ts
import { Command, Option } from "commander";
import { prepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
import type { PrepareOptions, ProviderName, WritingStyle } from "./types/config.js";

interface CliDependencies {
  prepare: typeof prepareCommand;
  status: typeof statusCommand;
}

export function createProgram(
  deps: CliDependencies = { prepare: prepareCommand, status: statusCommand },
): Command {
  const program = new Command()
    .name("repopassport")
    .description("AI-assisted English README generation for open-source projects (GitHub / Gitee / ACGit)")
    .version("0.1.0");

  program
    .command("prepare [repo-url]")
    .description("Analyze a repository and generate evidence-backed README drafts")
    .addOption(new Option("-p, --provider <name>", "AI Provider").choices(["openai", "mock"]))
    .addOption(new Option("--style <style>", "Writing style").choices(["professional", "balanced", "friendly"]))
    .option("-m, --model <name>", "Model name override")
    .option("--submit", "Fork + Commit + Push + Draft PR after human review")
    .option("-o, --output <path>", "Write final draft to this path")
    .option("--open", "Open the saved draft in an editor")
    .option("--verbose", "Verbose logging")
    .action(async (repoUrl: string | undefined, options: Record<string, unknown>) => {
      const normalized: PrepareOptions = {
        provider: options.provider as ProviderName | undefined,
        model: options.model as string | undefined,
        style: options.style as WritingStyle | undefined,
        submit: Boolean(options.submit),
        output: options.output as string | undefined,
        open: Boolean(options.open),
        verbose: Boolean(options.verbose),
      };
      await deps.prepare(repoUrl ?? ".", normalized);
    });

  program
    .command("status <pr-url>")
    .description("Check the status of a submitted PR")
    .option("--verbose", "Verbose logging")
    .action(async (prUrl: string, options: Record<string, unknown>) => {
      await deps.status(prUrl, Boolean(options.verbose));
    });

  return program;
}
```

- [ ] **Step 4: Reduce the executable entry point**

Replace `src/index.ts` with:

```ts
#!/usr/bin/env node

import { createProgram } from "./cli.js";

createProgram().parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

- [ ] **Step 5: Run CLI tests, typecheck, and compiled help**

Run: `npx vitest run tests/cli.test.ts && npm run typecheck && npm run build && node dist/index.js prepare --help`

Expected: tests PASS, typecheck/build exit 0, help shows `[repo-url]`, `--style`, `--open`, and no `(default: "mock")` text.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/cli.ts src/index.ts tests/cli.test.ts
git commit -m "feat: simplify local prepare CLI"
```

---

### Task 5: Isolate explicit output and editor opening

**Files:**
- Create: `src/output/files.ts`
- Test: `tests/output.test.ts`

**Interfaces:**
- Consumes: optional `--output`, configured output directory, repository name, language availability, Markdown, environment, and platform.
- Produces: `resolveOutputPaths()`, `writeOutputFiles()`, `getOpenCommand()`, and `openFile()`.

- [ ] **Step 1: Write failing pure path/command tests**

Create `tests/output.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { getOpenCommand, resolveOutputPaths } from "../src/output/files.js";

describe("resolveOutputPaths", () => {
  it("uses the explicit path for English-only output", () => {
    const cwd = resolve("fixture-repo");
    expect(resolveOutputPaths("docs/README.en.md", undefined, "demo", false, cwd)).toEqual({
      english: resolve(cwd, "docs/README.en.md"),
    });
  });

  it("derives English next to Chinese for dual output", () => {
    const cwd = resolve("fixture-repo");
    expect(resolveOutputPaths("README.md", undefined, "demo", true, cwd)).toEqual({
      chinese: resolve(cwd, "README.md"),
      english: resolve(cwd, "README.en.md"),
    });
  });
});

describe("getOpenCommand", () => {
  it("prefers EDITOR without shell interpolation", () => {
    expect(getOpenCommand("C:/repo/README.en.md", { EDITOR: "code" }, "win32")).toEqual({ command: "code", args: ["C:/repo/README.en.md"] });
  });

  it("uses platform defaults", () => {
    expect(getOpenCommand("/tmp/README.md", {}, "darwin")).toEqual({ command: "open", args: ["/tmp/README.md"] });
    expect(getOpenCommand("/tmp/README.md", {}, "linux")).toEqual({ command: "xdg-open", args: ["/tmp/README.md"] });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/output.test.ts`

Expected: FAIL because `src/output/files.ts` does not exist.

- [ ] **Step 3: Implement path resolution, writing, and shell-free opening**

Create `src/output/files.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, parse, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OutputPaths {
  english: string;
  chinese?: string;
}

export function resolveOutputPaths(
  explicitOutput: string | undefined,
  configuredOutputDir: string | undefined,
  repoName: string,
  hasChinese: boolean,
  cwd = process.cwd(),
): OutputPaths | null {
  if (!explicitOutput && !configuredOutputDir) return null;
  const primary = explicitOutput
    ? resolve(cwd, explicitOutput)
    : resolve(cwd, configuredOutputDir!, repoName, hasChinese ? "README.md" : "README.en.md");
  if (!hasChinese) return { english: primary };
  const parsed = parse(primary);
  const suffix = extname(primary) || ".md";
  return {
    chinese: primary,
    english: join(parsed.dir, `${parsed.name}.en${suffix}`),
  };
}

export async function writeOutputFiles(
  paths: OutputPaths,
  english: string,
  chinese?: string,
): Promise<void> {
  await mkdir(dirname(paths.english), { recursive: true });
  await writeFile(paths.english, english, "utf-8");
  if (paths.chinese && chinese) {
    await mkdir(dirname(paths.chinese), { recursive: true });
    await writeFile(paths.chinese, chinese, "utf-8");
  }
}

export function getOpenCommand(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  const editor = env.VISUAL ?? env.EDITOR;
  if (editor) return { command: editor, args: [file] };
  if (platform === "win32") return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", file] };
  if (platform === "darwin") return { command: "open", args: [file] };
  return { command: "xdg-open", args: [file] };
}

export async function openFile(file: string): Promise<void> {
  const { command, args } = getOpenCommand(file);
  await execFileAsync(command, args, { windowsHide: true });
}
```

- [ ] **Step 4: Add write and open-failure tests with temporary directories**

Extend `tests/output.test.ts` to use `mkdtemp`, `readFile`, and `rm`; write both files and assert exact content. Test `getOpenCommand()` rather than launching a real editor. The integration layer will catch `openFile()` errors and retain saved files.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run tests/output.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/output/files.ts tests/output.test.ts
git commit -m "feat: add local README output helpers"
```

---

### Task 6: Build reusable draft bundles and evidence filtering

**Files:**
- Create: `src/evidence/filter.ts`
- Create: `src/commands/draft.ts`
- Modify: `src/evidence/report.ts`
- Modify: `src/commands/prepare.ts` (remove the private `filterReadmeByEvidence` only after callers move)
- Test: `tests/report.test.ts`
- Test: `tests/draft.test.ts`

**Interfaces:**
- Consumes: cached `RepoFacts`, optional original README, `Provider`, `WritingStyle`, and `Logger`.
- Produces: `DraftBundle { english, chinese?, evidenceMap }`, `generateDraftBundle()`, and public `filterReadmeByEvidence()`.

- [ ] **Step 1: Write a failing bundle test with a counting Provider**

Create `tests/draft.test.ts` using a Provider that returns a valid factual README on the first generation call and returns its input unchanged on polish. Assert:

```ts
const bundle = await generateDraftBundle(facts, "# 原文", provider, "balanced", log);
expect(bundle.english).toContain("# Demo");
expect(bundle.chinese).toBeUndefined();
expect(bundle.evidenceMap.length).toBeGreaterThan(0);
expect(provider.calls).toBe(2); // factual English + polish English
```

Add a no-original-README case expecting four calls: factual Chinese, polish Chinese, factual English, polish English.

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/draft.test.ts`

Expected: FAIL because `src/commands/draft.ts` does not exist.

- [ ] **Step 3: Move evidence filtering without behavior changes**

Create `src/evidence/filter.ts` by moving the existing `filterReadmeByEvidence(readme, evidenceMap)` implementation out of `prepare.ts` and exporting it. Preserve its current section-level behavior exactly. Add a regression assertion in `tests/draft.test.ts` that an unsupported `## Roadmap` section is removed.

In `src/evidence/report.ts`, add `"quick start": "usage"` and `"快速开始": "usage"` to `SECTION_TO_CATEGORY`. Extend `tests/report.test.ts` with an evidenced Usage fact and assert that both headings receive the Usage evidence reference. This prevents the new Quick Start section from being removed immediately after generation.

- [ ] **Step 4: Implement draft bundle generation**

Create `src/commands/draft.ts`:

```ts
import type { Provider } from "../ai/client.js";
import { generateChineseReadme, generateReadme } from "../ai/generate.js";
import { polishReadme } from "../ai/polish.js";
import { filterReadmeByEvidence } from "../evidence/filter.js";
import { buildContentEvidenceMap } from "../evidence/report.js";
import type { RepoFacts } from "../types/facts.js";
import type { ContentEvidenceMap } from "../types/run.js";
import type { WritingStyle } from "../types/config.js";
import type { Logger } from "../utils/log.js";

export interface DraftBundle {
  english: string;
  chinese?: string;
  evidenceMap: ContentEvidenceMap[];
}

export async function generateDraftBundle(
  facts: RepoFacts,
  originalReadme: string | undefined,
  provider: Provider,
  style: WritingStyle,
  log: Logger,
): Promise<DraftBundle> {
  let chinese: string | undefined;
  if (!originalReadme) {
    const factualChinese = await generateChineseReadme(facts, provider, log);
    chinese = await polishReadme(factualChinese, facts, provider, style, "zh", log);
  }

  const factualEnglish = await generateReadme(facts, originalReadme, provider, log);
  const polishedEnglish = await polishReadme(factualEnglish, facts, provider, style, "en", log);
  const evidenceMap = buildContentEvidenceMap(polishedEnglish, facts);
  return {
    english: filterReadmeByEvidence(polishedEnglish, evidenceMap),
    chinese,
    evidenceMap,
  };
}
```

- [ ] **Step 5: Run bundle, report, and integration tests**

Run: `npx vitest run tests/draft.test.ts tests/report.test.ts tests/prepare.integration.test.ts && npm run typecheck`

Expected: PASS. If the old integration test still imports generation functions directly, keep that test and add bundle coverage rather than deleting it.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/evidence/filter.ts src/evidence/report.ts src/commands/draft.ts src/commands/prepare.ts tests/draft.test.ts tests/report.test.ts
git commit -m "refactor: isolate README draft generation"
```

---

### Task 7: Add a testable review action loop

**Files:**
- Create: `src/commands/review.ts`
- Test: `tests/review.test.ts`

**Interfaces:**
- Consumes: one line of user input or a readline prompt.
- Produces: `ReviewAction = "save" | "regenerate" | "edit" | "quit"`, `parseReviewAction()`, `promptReviewAction()`, and `promptEditComplete()`.

- [ ] **Step 1: Write failing action parsing tests**

Create `tests/review.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseReviewAction } from "../src/commands/review.js";

describe("parseReviewAction", () => {
  it.each([
    ["s", "save"], ["save", "save"], ["r", "regenerate"],
    ["e", "edit"], ["q", "quit"], ["", "quit"], ["unknown", "quit"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(parseReviewAction(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `npx vitest run tests/review.test.ts`

Expected: FAIL because `src/commands/review.ts` does not exist.

- [ ] **Step 3: Implement parsing and prompting**

Create `src/commands/review.ts`:

```ts
import * as readline from "node:readline";

export type ReviewAction = "save" | "regenerate" | "edit" | "quit";

export function parseReviewAction(input: string): ReviewAction {
  switch (input.trim().toLowerCase()) {
    case "s": case "save": return "save";
    case "r": case "regenerate": return "regenerate";
    case "e": case "edit": return "edit";
    case "q": case "quit": return "quit";
    default: return "quit";
  }
}

export function promptReviewAction(): Promise<ReviewAction> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("\n[s] 保存  [r] 重新生成  [e] 编辑  [q] 退出: ", (answer) => {
      rl.close();
      resolve(parseReviewAction(answer));
    });
  });
}

export function promptEditComplete(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("编辑完成并保存文件后按 Enter 继续审核...", () => {
      rl.close();
      resolve();
    });
  });
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/review.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/commands/review.ts tests/review.test.ts
git commit -m "feat: add README review actions"
```

---

### Task 8: Integrate settings, polishing, output, opening, and regeneration

**Files:**
- Modify: `src/commands/prepare.ts`
- Modify: `tests/prepare.integration.test.ts`

**Interfaces:**
- Consumes: `loadLocalConfig()`, `resolveSettings()`, `generateDraftBundle()`, `promptReviewAction()`, `resolveOutputPaths()`, `writeOutputFiles()`, and `openFile()`.
- Produces: the final user-facing behavior specified in the design while preserving `submitChanges()` and its confirmation boundary. `showDraftReview()` returns no value; `finishLocalReview()` returns the saved English path; edited content is re-read and re-filtered before confirmation.

- [ ] **Step 1: Add failing integration coverage for real-default selection and cached regeneration**

Add an exported `PrepareDependencies` interface and `prepareCommandWithDependencies(repoUrl, options, deps)` function. Keep `prepareCommand(repoUrl, options)` as the production wrapper that passes `defaultPrepareDependencies`. The dependency interface must contain exact function-typed fields for `loadLocalConfig`, `cloneRepo`, `collectFiles`, `extractFacts`, `generateDraftBundle`, `promptReviewAction`, `promptEditComplete`, `writeOutputFiles`, and `openFile`. Add tests with typed spies that assert:

```ts
expect(cloneRepo).toHaveBeenCalledTimes(1);
expect(extractFacts).toHaveBeenCalledTimes(1);
expect(generateDraftBundle).toHaveBeenCalledTimes(2);
expect(promptReviewAction).toHaveBeenCalledTimes(2);
```

Use review actions `["regenerate", "save"]`. Add another case where no key and no explicit Mock causes a configuration error before cloning.

- [ ] **Step 2: Run focused integration tests and observe failure**

Run: `npx vitest run tests/prepare.integration.test.ts`

Expected: FAIL because current `prepareCommand()` creates its Provider internally, has no regeneration loop, and writes `--output` before review.

- [ ] **Step 3: Resolve settings once before repository work**

At the beginning of `prepareCommand()`, load local config and resolve settings:

```ts
const localConfig = await loadLocalConfig();
const settings = resolveSettings(options, process.env, localConfig);
const provider = createProvider({
  provider: settings.provider,
  model: settings.model,
  apiKey: settings.apiKey,
  baseURL: settings.baseURL,
});
```

Delete `createProviderFromOptions()`. Display `settings.provider`, `settings.model`, and `settings.style` in the review header. Never print the API key.

- [ ] **Step 4: Replace one-shot generation with a cached-facts draft loop**

Keep cloning, file collection, and `extractFacts()` outside the loop. Replace direct Chinese/English generation with:

```ts
let draft = await generateDraftBundle(facts, originalReadme, provider, settings.style, log);

while (true) {
  showDraftReview(draft, facts, files, adapter, options, settings, cloneResult.meta);
  const action = await promptReviewAction();
  if (action === "regenerate") {
    const previous = draft;
    try {
      draft = await generateDraftBundle(facts, originalReadme, provider, settings.style, log);
    } catch (error) {
      draft = previous;
      log.warn(`重新生成失败，保留上一版本: ${sanitizeForOutput(error instanceof Error ? error.message : String(error))}`);
    }
    continue;
  }

  if (action === "edit") {
    const englishPath = await finishLocalReview(action, draft, facts, options, settings, cloneResult.meta, run, log);
    try { await openFile(englishPath); }
    catch (error) {
      log.warn(`文稿已保存，但无法打开编辑器: ${sanitizeForOutput(error instanceof Error ? error.message : String(error))}`);
      continue;
    }
    await promptEditComplete();
    const editedEnglish = await readFile(englishPath, "utf-8");
    const editedMap = buildContentEvidenceMap(editedEnglish, facts);
    draft = {
      ...draft,
      english: filterReadmeByEvidence(editedEnglish, editedMap),
      evidenceMap: editedMap,
    };
    continue;
  }

  if (action === "quit") {
    run.steps.review = { status: "skipped" };
    run.completedAt = new Date().toISOString();
    await saveRun(run, log);
    break;
  }

  const englishPath = await finishLocalReview(action, draft, facts, options, settings, cloneResult.meta, run, log);
  if (options.open) {
    try { await openFile(englishPath); }
    catch (error) { log.warn(`文稿已保存，但无法打开编辑器: ${sanitizeForOutput(error instanceof Error ? error.message : String(error))}`); }
  }

  if (options.submit) {
    const confirmed = await promptSubmitConfirmation(targetRepo, log);
    if (confirmed) {
      await submitChanges({
        run,
        runId,
        tempDir: tempDir!,
        cloneResult,
        adapter,
        platform,
        options,
        filteredReadme: draft.english,
        generatedChineseReadme: draft.chinese,
        files,
        log,
      });
    } else {
      run.steps.review = { status: "skipped" };
      run.completedAt = new Date().toISOString();
      await saveRun(run, log);
    }
  }
  break;
}
```

Extract `showDraftReview(...): void` and `finishLocalReview(...): Promise<string>` inside `prepare.ts` initially; do not move submit orchestration in this task. `finishLocalReview()` must return the absolute English README path, using `join(archiveDirectory, "README.en.md")` when no explicit/configured output path exists.

- [ ] **Step 5: Save accepted output only after review**

Remove the current early `--output` writes before Diff display. In `finishLocalReview()`:

1. Always call the existing archival `saveDraftLocally()` so Facts/evidence remain recorded.
2. Resolve explicit/configured paths with `resolveOutputPaths(options.output, settings.outputDir, repoMeta.name, Boolean(draft.chinese))`.
3. When paths exist, call `writeOutputFiles(paths, draft.english, draft.chinese)`.
4. Choose the English explicit path when present, otherwise the archived `README.en.md`, for editor opening.
5. Catch only editor-open errors; do not hide write failures.
6. Mark review `completed` for save/edit and `skipped` for quit.
7. Set `run.completedAt` and call `saveRun()` before returning from a non-submit save or edit path.

- [ ] **Step 6: Preserve submit confirmation after every review action**

Use the same save/regenerate/edit/quit loop in both local and submit modes. Only the `save` action may advance to `promptSubmitConfirmation()`. `regenerate` returns to review with cached RepoFacts, `edit` re-reads and filters the saved file before returning to review, and `quit` exits without remote operations. Pass the final `draft.english` and `draft.chinese` into `submitChanges()` only after the existing full confirmation text succeeds.

- [ ] **Step 7: Run focused and safety suites**

Run: `npx vitest run tests/prepare.integration.test.ts tests/safety.test.ts tests/output.test.ts tests/config.test.ts tests/draft.test.ts && npm run typecheck`

Expected: PASS; integration assertions prove clone/extract run once across regeneration.

- [ ] **Step 8: Commit Task 8**

```bash
git add src/commands/prepare.ts tests/prepare.integration.test.ts
git commit -m "feat: integrate polished local README workflow"
```

---

### Task 9: Document and verify the complete workflow

**Files:**
- Modify: `docs/testing/e2e-checklist.md`
- Create: `docs/testing/readme-quality-scorecard.md`

**Interfaces:**
- Consumes: compiled CLI and 3–5 controlled JS/TS repositories.
- Produces: reproducible setup/use instructions and recorded human quality scores.

- [ ] **Step 1: Add the quality scorecard**

Create `docs/testing/readme-quality-scorecard.md` with this table and pass rule:

```markdown
# README Quality Scorecard

| Repository | Commit | Model | Style | Credibility | Clarity | Practicality | Naturalness | Unsupported claims |
|---|---|---|---|---:|---:|---:|---:|---:|
| | | | balanced | | | | | |

Each score is 1–5. Pass only when every dimension averages at least 4.0 across 3–5 repositories and unsupported key claims equal 0. Record exact evidence mismatches below the table.
```

- [ ] **Step 2: Update the E2E checklist with exact local commands**

Add these dry-run examples to `docs/testing/e2e-checklist.md`:

```powershell
$env:OPENAI_API_KEY=(Read-Host "OPENAI_API_KEY")
$env:OPENAI_BASE_URL="https://api.openai.com/v1"
npm run build
node dist/index.js prepare . --style balanced --output .tmp/README.md
node dist/index.js prepare . --style friendly --open
node dist/index.js prepare . --provider mock
```

State that only the final command is Mock, API keys must not be pasted into scorecards, and `--submit` is excluded from quality sampling.

- [ ] **Step 3: Run the full automated verification**

Run: `npm run typecheck && npm run build && npm test`

Expected: all commands exit 0 and all test files pass with zero failures.

- [ ] **Step 4: Verify compiled CLI behavior without network access**

Run:

```powershell
node dist/index.js prepare --help
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
node dist/index.js prepare .
node dist/index.js prepare . --provider mock --output .tmp/README.md
```

Expected:

- Help shows optional `[repo-url]`, `--style`, `--open`, and no Mock default.
- The unconfigured real-provider command exits non-zero with setup guidance before cloning.
- Explicit Mock completes the generation path without network access and writes expected output only after review acceptance.

- [ ] **Step 5: Perform controlled real-model quality sampling**

With a configured real Provider, run `prepare` in non-submit mode on 3–5 controlled JS/TS repositories. Record repository commit, model, style, the four 1–5 scores, and every unsupported claim in `docs/testing/readme-quality-scorecard.md`. Do not create remote resources.

Expected: each dimension averages at least 4.0 and unsupported key claims total 0. If not, retain the evidence in the scorecard and open a narrowly scoped follow-up rather than adding an automatic retry loop.

- [ ] **Step 6: Confirm repository hygiene**

Run: `git status --short` and inspect `.tmp/`, drafts, and generated README files.

Expected: no API key, generated draft, `.tmp` artifact, or unrelated workspace change is staged. Remove only test artifacts created by this plan, after verifying their absolute paths are inside the worktree.

- [ ] **Step 7: Commit Task 9**

```bash
git add docs/testing/e2e-checklist.md docs/testing/readme-quality-scorecard.md
git commit -m "docs: add README quality verification workflow"
```

---

## Final Verification

- [ ] Run `npm run typecheck` and confirm exit code 0.
- [ ] Run `npm run build` and confirm exit code 0.
- [ ] Run `npm test` and confirm zero failed tests.
- [ ] Run `node dist/index.js prepare --help` and confirm the documented local options.
- [ ] Run explicit Mock locally and confirm no network or remote Git operation occurs.
- [ ] Inspect every commit and `git diff` to ensure the pre-existing safety/platform work remains intact.
- [ ] Confirm the quality scorecard contains 3–5 real-model samples before claiming the human quality acceptance criterion is met.
