#!/usr/bin/env node

import { Command } from "commander";
import { prepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
import type { PrepareOptions } from "./types/config.js";

const program = new Command();

program
  .name("repopassport")
  .description("AI-assisted English README generation for Chinese open-source projects")
  .version("0.1.0");

program
  .command("prepare <repo-url>")
  .description("Analyze a GitHub repository and generate an English README draft")
  .option("-p, --provider <name>", "AI Provider (openai, mock)", "mock")
  .option("-m, --model <name>", "Model name override")
  .option("--dry-run", "Only generate draft, do not fork or create PR", false)
  .option("--no-dry-run", "Submit Fork + Draft PR after review")
  .option("-o, --output <path>", "Write draft to file path instead of stdout")
  .option("--verbose", "Verbose logging")
  .action(async (repoUrl: string, options: Record<string, unknown>) => {
    const dryRun = options["dryRun"] !== false;
    const opts: PrepareOptions = {
      provider: (options["provider"] as string) || "mock",
      model: options["model"] as string | undefined,
      dryRun,
      output: options["output"] as string | undefined,
      verbose: (options["verbose"] as boolean) || false,
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

program.parse();
