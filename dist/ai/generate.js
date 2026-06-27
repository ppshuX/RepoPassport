/**
 * 第二步：基于 RepoFacts 生成英文 README 草稿。
 */
export async function generateReadme(facts, originalReadme, provider, log) {
    log.info("生成英文 README 草稿...");
    const systemPrompt = buildGenerateSystemPrompt();
    const userPrompt = buildGenerateUserPrompt(facts, originalReadme);
    const response = await provider.chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
    ]);
    const readme = extractMarkdown(response.content);
    log.info(`英文 README 生成完成 (${readme.split("\n").length} 行)`);
    return readme;
}
function buildGenerateSystemPrompt() {
    return `You are a technical writer creating an English README for an open-source project.

CRITICAL RULES:
1. ONLY write content supported by the provided RepoFacts. No evidence = do not write.
2. Installation instructions based on package.json scripts and dependencies. Do not invent commands.
3. Tech stack descriptions use real package names from package.json.
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

{tech stack from package.json}

## Installation

{installation steps from package.json scripts and README}

## Usage

{usage examples confirmed from source code exports}

## API

{API surface from confirmed exports}

## License

{license from LICENSE file or package.json, omit if not found}`;
}
function buildGenerateUserPrompt(facts, originalReadme) {
    const factsJson = JSON.stringify({
        repo: facts.repo,
        items: facts.items.map((item) => ({
            category: item.category,
            content: item.content,
            confidence: item.combinedConfidence,
        })),
        overallConfidence: facts.overallConfidence,
    }, null, 2);
    let prompt = `Repository: ${facts.repo.owner}/${facts.repo.name}\n\n`;
    prompt += `Repofacts:\n\`\`\`json\n${factsJson}\n\`\`\`\n\n`;
    if (originalReadme) {
        prompt += `Original README (for context, but write in English based on facts):\n\`\`\`markdown\n${originalReadme.slice(0, 3000)}\n\`\`\`\n\n`;
    }
    prompt += `Generate an English README based ONLY on the RepoFacts above. Return ONLY the Markdown content.`;
    return prompt;
}
function extractMarkdown(text) {
    // 仅去掉显式 ```markdown ... ``` 包裹
    const block = text.match(/```markdown\s*([\s\S]*?)```/);
    if (block)
        return block[1].trim();
    // 如果整个内容被 ``` 包裹（无标签或非 markdown 标签），尝试提取
    const anyBlock = text.match(/^```(?:\w*)?\s*([\s\S]*?)```$/);
    if (anyBlock)
        return anyBlock[1].trim();
    return text.trim();
}
//# sourceMappingURL=generate.js.map