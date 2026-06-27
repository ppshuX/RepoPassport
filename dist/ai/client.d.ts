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
export declare class OpenAIProvider implements Provider {
    private apiKey;
    private baseURL;
    private model;
    constructor(config: ProviderConfig);
    chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse>;
}
/**
 * Mock Provider。
 * 返回合法的 RepoFacts 或 README 草稿，用于测试。
 */
export declare class MockProvider implements Provider {
    private callCount;
    chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResponse>;
    private mockRepoFacts;
    private mockReadme;
}
/**
 * 创建 Provider 实例。
 * - mock: 使用 MockProvider
 * - openai: 从环境变量 OPENAI_API_KEY 读取 Key
 */
export declare function createProvider(config: ProviderConfig): Provider;
//# sourceMappingURL=client.d.ts.map