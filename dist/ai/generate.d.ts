import type { Provider } from "./client.js";
import type { RepoFacts } from "../types/facts.js";
import type { Logger } from "../utils/log.js";
/**
 * 第二步：基于 RepoFacts 生成英文 README 草稿。
 */
export declare function generateReadme(facts: RepoFacts, originalReadme: string | undefined, provider: Provider, log: Logger): Promise<string>;
//# sourceMappingURL=generate.d.ts.map