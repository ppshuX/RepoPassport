/** AI Provider 配置 */
export interface ProviderConfig {
    provider: "openai" | "mock";
    model: string;
    apiKey: string;
    baseURL?: string;
}
/** CLI prepare 命令选项 */
export interface PrepareOptions {
    provider: string;
    model?: string;
    dryRun: boolean;
    output?: string;
    verbose: boolean;
}
//# sourceMappingURL=config.d.ts.map