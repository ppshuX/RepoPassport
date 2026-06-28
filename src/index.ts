#!/usr/bin/env node

import { Command } from "commander";
import { loadEnv } from "./utils/env.js";
import { prepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
import type { PrepareOptions } from "./types/config.js";

// ── 启动时加载 ~/.repopassport/.env ──
loadEnv();

/**
 * 智能默认 Provider：
 * - 如果环境中有 OPENAI_API_KEY，默认使用 openai
 * - 否则保持 mock
 */
function defaultProvider(): string {
  if (process.env["OPENAI_API_KEY"]) return "openai";
  return "mock";
}

const program = new Command();

program
  .name("repopassport")
  .description("AI-assisted English README generation for open-source projects (GitHub / Gitee / ACGit)")
  .version("0.1.0");

program
  .command("prepare <repo-url>")
  .description("Analyze a repository and generate an English README draft (supports github.com, gitee.com, git.woa.com)")
  .option("-p, --provider <name>", `AI Provider (openai, mock). Default: auto-detect`, defaultProvider())
  .option("-m, --model <name>", "Model name override")
  .option("--submit", "Fork + Commit + Push + Draft PR after human review (DANGER: creates real remote resources)")
  .option("-o, --output <path>", "Write draft to file path instead of stdout")
  .option("-y, --yes", "Skip interactive confirmation, auto-save draft")
  .option("--verbose", "Verbose logging")
  .action(async (repoUrl: string, options: Record<string, unknown>) => {
    const opts: PrepareOptions = {
      provider: (options["provider"] as string) || defaultProvider(),
      model: options["model"] as string | undefined,
      submit: (options["submit"] as boolean) || false,
      output: options["output"] as string | undefined,
      verbose: (options["verbose"] as boolean) || false,
      yes: (options["yes"] as boolean) || false,
    };

    await prepareCommand(repoUrl, opts);
  });

program
  .command("status <pr-url>")
  .description("Check the status of a submitted PR")
  .option("--verbose", "Verbose logging")
  .action(async (prUrl: string, options: Record<string, unknown>) => {
    await statusCommand(prUrl, (options["verbose"] as boolean) || false);
  });

program
  .command("web")
  .description("Start the Web Panel (localhost:3617)")
  .option("-p, --port <number>", "Port number", "3617")
  .action(async (options: Record<string, unknown>) => {
    const { startWebServer } = await import("./web/server.js");
    const port = parseInt(options["port"] as string, 10) || 3617;
    try {
      await startWebServer(port, "127.0.0.1");
    } catch (err) {
      console.error(`Failed to start web server: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program.parse();
