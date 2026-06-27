#!/usr/bin/env node
import { Command } from "commander";
import { prepareCommand } from "./commands/prepare.js";
import { statusCommand } from "./commands/status.js";
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
    .action(async (repoUrl, options) => {
    const dryRun = options["dryRun"] !== false;
    const opts = {
        provider: options["provider"] || "mock",
        model: options["model"],
        dryRun,
        output: options["output"],
        verbose: options["verbose"] || false,
    };
    await prepareCommand(repoUrl, opts);
});
program
    .command("status <pr-url>")
    .description("Check the status of a submitted PR")
    .option("--verbose", "Verbose logging")
    .action(async (prUrl, options) => {
    await statusCommand(prUrl, options["verbose"] || false);
});
program.parse();
//# sourceMappingURL=index.js.map