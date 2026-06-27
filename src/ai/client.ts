/**
 * AI Provider 接口和实现。
 */

import type { ProviderConfig } from "../types/config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
}

export interface Provider {
  chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse>;
}

/**
 * OpenAI-compatible Provider。
 * 使用 Node 18+ 原生 fetch。
 * API Key 仅从环境变量读取。
 */
export class OpenAIProvider implements Provider {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || "https://api.openai.com/v1";
    this.model = config.model || "gpt-4o-mini";
  }

  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    const url = `${this.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI API 错误 (${response.status}): ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI API 返回空内容");
    }

    return { content };
  }
}

/**
 * Mock Provider。
 * 返回合法的 RepoFacts 或 README 草稿，用于测试。
 */
export class MockProvider implements Provider {
  private callCount = 0;

  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
    this.callCount++;
    const systemContent = messages.find((m) => m.role === "system")?.content || "";

    // 基于 system prompt 内容判断调用类型
    if (systemContent.includes("code analysis engine")) {
      return { content: this.mockRepoFacts() };
    }

    if (systemContent.includes("technical writer")) {
      return { content: this.mockReadme() };
    }

    // 兜底：第一次调用是提取事实，第二次是生成文档
    if (this.callCount === 1) {
      return { content: this.mockRepoFacts() };
    }
    return { content: this.mockReadme() };
  }

  private mockRepoFacts(): string {
    const sha = "0000000000000000000000000000000000000000";
    return JSON.stringify({
      items: [
        {
          category: "project_name",
          content: "sample-lib - A demonstration library for testing",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: sha,
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 1.0,
        },
        {
          category: "description",
          content:
            "A lightweight utility library providing common helper functions for TypeScript projects, including string manipulation, array utilities, and validation helpers.",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: sha,
              confidence: 0.95,
              extractionMethod: "ai-inferred",
            },
            {
              sourceType: "file",
              filePath: "README.md",
              commitSha: sha,
              symbol: "description",
              confidence: 0.9,
              extractionMethod: "ai-inferred",
            },
          ],
          combinedConfidence: 0.93,
        },
        {
          category: "tech_stack",
          content: "TypeScript, Node.js",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: sha,
              symbol: "devDependencies.typescript",
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 1.0,
        },
        {
          category: "installation",
          content: "Install via npm: `npm install sample-lib` or via pnpm: `pnpm add sample-lib`",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: sha,
              symbol: "name",
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 1.0,
        },
        {
          category: "usage",
          content:
            'Import the module: `import { greet, formatDate, validateEmail } from "sample-lib"`. Call `greet("World")` to get a greeting string.',
          evidence: [
            {
              sourceType: "export",
              filePath: "src/index.ts",
              commitSha: sha,
              symbol: "greet",
              lineRange: [1, 5],
              confidence: 0.85,
              extractionMethod: "ai-inferred",
            },
          ],
          combinedConfidence: 0.85,
        },
        {
          category: "api_surface",
          content:
            "Exported functions: `greet(name: string): string`, `formatDate(date: Date): string`, `validateEmail(email: string): boolean`",
          evidence: [
            {
              sourceType: "export",
              filePath: "src/index.ts",
              commitSha: sha,
              symbol: "greet",
              lineRange: [1, 10],
              confidence: 0.8,
              extractionMethod: "ai-inferred",
            },
          ],
          combinedConfidence: 0.8,
        },
        {
          category: "dependencies",
          content: "Zero external runtime dependencies. Dev dependencies: TypeScript, Vitest.",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: sha,
              symbol: "dependencies",
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 1.0,
        },
      ],
      overallConfidence: 0.94,
    });
  }

  private mockReadme(): string {
    return `# sample-lib

A lightweight utility library providing common helper functions for TypeScript projects, including string manipulation, array utilities, and validation helpers.

## Features

- String manipulation utilities
- Array helper functions  
- Email and input validation
- Date formatting helpers
- Fully typed with TypeScript

## Tech Stack

- TypeScript
- Node.js

## Installation

\`\`\`bash
npm install sample-lib
# or
pnpm add sample-lib
\`\`\`

## Usage

\`\`\`typescript
import { greet, formatDate, validateEmail } from "sample-lib";

console.log(greet("World"));
// => "Hello, World!"

console.log(formatDate(new Date()));
// => "2026-06-28"

console.log(validateEmail("test@example.com"));
// => true
\`\`\`

## API

### \`greet(name: string): string\`

Returns a greeting string for the given name.

### \`formatDate(date: Date): string\`

Formats a Date object as an ISO date string.

### \`validateEmail(email: string): boolean\`

Validates whether a string is a properly formatted email address.

## License

MIT
`;
  }
}

/**
 * 创建 Provider 实例。
 * - mock: 使用 MockProvider
 * - openai: 从环境变量 OPENAI_API_KEY 读取 Key
 */
export function createProvider(config: ProviderConfig): Provider {
  if (config.provider === "mock") {
    return new MockProvider();
  }

  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error(
      "未找到 API Key。请设置环境变量 OPENAI_API_KEY，或使用 --provider mock 进行测试。",
    );
  }

  return new OpenAIProvider(config);
}
