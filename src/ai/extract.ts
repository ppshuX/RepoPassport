import type { Provider } from "./client.js";
import type { FileContent, RepoFacts, RepoMeta } from "../types/facts.js";
import {
  validateRepoFacts,
  buildPartialRepoFacts,
  FactsItemSchema,
} from "../validate/facts.js";
import type { Logger } from "../utils/log.js";

/**
 * 第一步：从仓库文件中提取结构化 RepoFacts。
 */
export async function extractFacts(
  files: FileContent[],
  repoMeta: RepoMeta,
  provider: Provider,
  log: Logger,
  languages?: string[],
): Promise<RepoFacts> {
  log.info("提取仓库事实...");

  const systemPrompt = buildExtractSystemPrompt(languages);
  const userPrompt = buildExtractUserPrompt(files, repoMeta);

  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await provider.chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      const raw = extractJSON(response.content);
      const result = validateRepoFacts(raw);

      if (result.valid && result.data) {
        // 填充 repo 元信息（AI 不知道这些）
        const facts: RepoFacts = {
          repo: repoMeta,
          analyzedAt: new Date().toISOString(),
          items: result.data.items.map((item) => ({
            ...item,
            // 确保所有 evidence 的 commitSha 正确
            evidence: item.evidence.map((e) => ({
              ...e,
              commitSha: repoMeta.commitSha,
            })),
          })),
          overallConfidence: result.data.overallConfidence,
        };

        log.info(
          `事实提取完成: ${facts.items.length} 项，总置信度 ${facts.overallConfidence}`,
        );
        return facts;
      }

      // 校验不通过，尝试用部分有效项构建
      if (result.validItems !== undefined && result.validItems !== null) {
        log.warn(
          `Zod 校验: ${result.totalItems} 项中 ${result.validItems} 项有效`,
        );

        // 尝试从 raw 中获取 items
        const rawObj = raw as Record<string, unknown> | null;
        const items = Array.isArray(rawObj?.items) ? rawObj!.items : [];

        const validItems = items
          .map((item: unknown) => FactsItemSchema.safeParse(item))
          .filter((r) => r.success)
          .map((r) => r.data);

        const partialFacts = buildPartialRepoFacts(repoMeta, validItems);
        if (partialFacts) {
          log.info(`使用 ${partialFacts.items.length} 项有效事实继续（阈值: 3）`);
          return {
            repo: repoMeta,
            analyzedAt: new Date().toISOString(),
            items: partialFacts.items.map((item) => ({
              ...item,
              evidence: item.evidence.map((e) => ({
                ...e,
                commitSha: repoMeta.commitSha,
              })),
            })),
            overallConfidence: partialFacts.overallConfidence,
          };
        }

        if (attempt < maxRetries - 1) {
          log.warn("有效项不足阈值，重试...");
          lastError = new Error(
            `有效事实项不足: ${result.validItems} < 3`,
          );
          continue;
        }
      }

      if (attempt < maxRetries - 1) {
        log.warn("JSON 解析或校验失败，重试...");
        lastError = result.errors
          ? new Error(result.errors.message)
          : new Error("校验失败");
        continue;
      }

      throw lastError || new Error("事实提取失败：无法获取有效结果");
    } catch (err) {
      if (attempt < maxRetries - 1) {
        log.warn(`AI 调用失败，重试 (${attempt + 1}/${maxRetries})...`);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("事实提取失败");
}

function buildExtractSystemPrompt(languages?: string[]): string {
  const langNote = languages && languages.length > 0
    ? `\nThis repository uses: ${languages.join(", ")}. Adapt your analysis to these ecosystems (e.g., Go uses go.mod for deps, Python uses pyproject.toml, Rust uses Cargo.toml).`
    : "";

  return `You are a code analysis engine. Your ONLY job is to extract structured facts about a repository from the provided source files.${langNote}

Output MUST be valid JSON matching this schema:
{
  "items": [
    {
      "category": "project_name" | "description" | "purpose" | "tech_stack" | "installation" | "usage" | "configuration" | "api_surface" | "architecture" | "dependencies",
      "content": "factual statement (min 10 chars)",
      "evidence": [
        {
          "sourceType": "file" | "config" | "dependency" | "export",
          "filePath": "relative/path/to/file",
          "commitSha": "PLACEHOLDER",
          "symbol": "functionName or configKey (optional)",
          "lineRange": [startLine, endLine] (optional, 1-based),
          "confidence": 0.0-1.0,
          "extractionMethod": "static" | "ai-inferred"
        }
      ],
      "combinedConfidence": 0.0-1.0
    }
  ],
  "overallConfidence": 0.0-1.0
}

CRITICAL RULES:
1. Each item MUST have at least 1 evidence with specific filePath from the provided files.
2. Use "static" for facts directly read from config files (package.json, pyproject.toml, go.mod, Cargo.toml, etc).
3. Use "ai-inferred" for facts inferred from source code or README.
4. DO NOT invent facts not supported by the provided files. If unsure, skip the item.
5. DO NOT guess package purposes from names. Only report what you find in the files.
6. Tech stack items MUST come from config/dependency files found in the repository.
7. Installation instructions MUST be based on build scripts (npm scripts, Makefile, etc) or README content.
8. Set confidence to 0 for items you are unsure about.
9. Output ONLY the JSON object, no markdown, no explanations.

Output format: { "items": [...], "overallConfidence": 0.0 }`;
}

function buildExtractUserPrompt(
  files: FileContent[],
  repoMeta: RepoMeta,
): string {
  const fileList = files.map((f) => f.path).join("\n");
  const fileContents = files
    .map((f) => `\n### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n");

  return `Repository: ${repoMeta.owner}/${repoMeta.name}
Default Branch: ${repoMeta.defaultBranch}

Files analyzed:
${fileList}

File contents:
${fileContents}

Extract RepoFacts from the above files. Return ONLY the JSON object.`;
}

/**
 * 从 AI 响应中提取 JSON 对象。
 */
function extractJSON(text: string): unknown {
  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 尝试提取 ```json ... ``` 块
    const jsonBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlock) {
      try {
        return JSON.parse(jsonBlock[1]);
      } catch {
        // 继续
      }
    }

    // 尝试找到 { 和 } 之间的内容
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // 最后的尝试失败
      }
    }

    throw new Error(`无法从 AI 响应中解析 JSON: ${text.slice(0, 200)}`);
  }
}
