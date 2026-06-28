import type { Provider } from "./client.js";
import type { RepoFacts } from "../types/facts.js";
import type { Logger } from "../utils/log.js";

/**
 * 第二步：基于 RepoFacts 生成英文 README 草稿。
 */
export async function generateReadme(
  facts: RepoFacts,
  originalReadme: string | undefined,
  provider: Provider,
  log: Logger,
  languages?: string[],
): Promise<string> {
  log.info("生成英文 README 草稿...");

  const systemPrompt = buildGenerateSystemPrompt(languages);
  const userPrompt = buildGenerateUserPrompt(facts, originalReadme);

  const response = await provider.chatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const readme = extractMarkdown(response.content);
  log.info(`英文 README 生成完成 (${readme.split("\n").length} 行)`);

  return readme;
}

function buildGenerateSystemPrompt(languages?: string[]): string {
  const langNote = languages && languages.length > 0
    ? `\nThis project uses: ${languages.join(", ")}. Use ecosystem-appropriate conventions in the README (e.g., pip/poetry for Python, go get for Go, cargo for Rust, maven/gradle for Java).`
    : "";

  return `You are a technical writer creating an English README for an open-source project.${langNote}

CRITICAL RULES:
1. ONLY write content supported by the provided RepoFacts. No evidence = do not write.
2. Installation instructions based on actual build system (npm/pip/cargo/go/maven) found in the facts.
3. Tech stack descriptions use real package/dependency names from config files.
4. Usage examples ONLY when actual API patterns are found in source code.
5. Do NOT fabricate "Contributing Guide", "Code of Conduct", or similar sections.
6. Do NOT add "Star History", "License Badge", or decorative elements.
7. Sections without evidence should be omitted entirely.
8. Write in clean, professional English. Be concise and factual.
9. Only output the Markdown content of the README. No explanations.

Template (only include sections with evidence):
# {project_name}

{description}

## Features

{features confirmed from source code}

## Tech Stack

{tech stack from config files}

## Installation

{installation steps from build scripts and README}

## Usage

{usage examples confirmed from source code exports}

## API

{API surface from confirmed exports}

## License

{license from LICENSE file or config, omit if not found}`;
}

function buildGenerateUserPrompt(
  facts: RepoFacts,
  originalReadme: string | undefined,
): string {
  const factsJson = JSON.stringify(
    {
      repo: facts.repo,
      items: facts.items.map((item) => ({
        category: item.category,
        content: item.content,
        confidence: item.combinedConfidence,
      })),
      overallConfidence: facts.overallConfidence,
    },
    null,
    2,
  );

  let prompt = `Repository: ${facts.repo.owner}/${facts.repo.name}\n\n`;
  prompt += `Repofacts:\n\`\`\`json\n${factsJson}\n\`\`\`\n\n`;

  if (originalReadme) {
    prompt += `Original README (for context, but write in English based on facts):\n\`\`\`markdown\n${originalReadme.slice(0, 3000)}\n\`\`\`\n\n`;
  }

  prompt += `Generate an English README based ONLY on the RepoFacts above. Return ONLY the Markdown content.`;

  return prompt;
}

/**
 * 生成中文 README。仅在项目没有 README.md 时调用。
 */
export async function generateChineseReadme(
  facts: RepoFacts,
  provider: Provider,
  log: Logger,
  languages?: string[],
): Promise<string> {
  log.info("生成中文 README 草稿...");

  const systemPrompt = buildChineseGenerateSystemPrompt(languages);
  const userPrompt = buildChineseGenerateUserPrompt(facts);

  const response = await provider.chatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const readme = extractMarkdown(response.content);
  log.info(`中文 README 生成完成 (${readme.split("\n").length} 行)`);

  return readme;
}

function buildChineseGenerateSystemPrompt(languages?: string[]): string {
  const langNote = languages && languages.length > 0
    ? `\n此项目使用: ${languages.join("、")}。在 README 中使用对应生态的惯例（如 Python 用 pip/poetry，Go 用 go get，Rust 用 cargo，Java 用 maven/gradle）。`
    : "";

  return `你是一名技术文档作者，为开源项目编写中文 README。${langNote}

关键规则：
1. 只写 RepoFacts 中有证据支持的内容。没有证据 = 不写。
2. 安装说明基于实际的构建系统（npm/pip/cargo/go/maven）中的配置。
3. 技术栈描述使用配置文件中的真实包名/依赖名。
4. 使用示例仅当在源代码中找到实际 API 模式时才写。
5. 不要编造"贡献指南"、"行为准则"等章节。
6. 不要添加"Star History"、"License Badge"等装饰元素。
7. 没有证据的章节直接省略。
8. 用清晰、专业的中文写作。简洁、真实。
9. 只输出 README 的 Markdown 内容。不要加任何解释。

模板（仅包含有证据的章节）：
# {项目名}

{描述}

## 功能特性

{从源码确认的功能}

## 技术栈

{来自配置文件的技术栈}

## 安装

{基于构建脚本的安装步骤}

## 使用方法

{从源码导出确认的使用示例}

## API

{从确认的导出中提取的 API 接口}

## 许可证

{来自 LICENSE 文件或配置文件，找不到则省略}`;
}

function buildChineseGenerateUserPrompt(facts: RepoFacts): string {
  const factsJson = JSON.stringify(
    {
      repo: facts.repo,
      items: facts.items.map((item) => ({
        category: item.category,
        content: item.content,
        confidence: item.combinedConfidence,
      })),
      overallConfidence: facts.overallConfidence,
    },
    null,
    2,
  );

  let prompt = `仓库: ${facts.repo.owner}/${facts.repo.name}\n\n`;
  prompt += `RepoFacts:\n\`\`\`json\n${factsJson}\n\`\`\`\n\n`;
  prompt += `请仅根据以上 RepoFacts 生成一份中文 README。只返回 Markdown 内容。`;

  return prompt;
}

function extractMarkdown(text: string): string {
  // 仅去掉显式 ```markdown ... ``` 包裹
  const block = text.match(/```markdown\s*([\s\S]*?)```/);
  if (block) return block[1].trim();

  // 如果整个内容被 ``` 包裹（无标签或非 markdown 标签），尝试提取
  const anyBlock = text.match(/^```(?:\w*)?\s*([\s\S]*?)```$/);
  if (anyBlock) return anyBlock[1].trim();

  return text.trim();
}
