#!/usr/bin/env node

import { Command } from "commander";
import { prepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
import type { PrepareOptions } from "./types/config.js";

const program = new Command();

program
  .name("repopassport")
  .description("AI-assisted English README generation for open-source projects (GitHub / Gitee / ACGit)")
  .version("0.1.0");

program
  .command("prepare <repo-url>")
  .description("Analyze a repository and generate an English README draft (supports github.com, gitee.com, git.woa.com)")
  .option("-p, --provider <name>", "AI Provider (openai, mock)", "mock")
  .option("-m, --model <name>", "Model name override")
  .option("--submit", "Fork + Commit + Push + Draft PR after human review (DANGER: creates real remote resources)")
  .option("-o, --output <path>", "Write draft to file path instead of stdout")
  .option("--verbose", "Verbose logging")
  .action(async (repoUrl: string, options: Record<string, unknown>) => {
    const opts: PrepareOptions = {
      provider: (options["provider"] as string) || "mock",
      model: options["model"] as string | undefined,
      submit: (options["submit"] as boolean) || false,
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
