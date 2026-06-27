import type { Provider } from "./client.js";
import type { FileContent, RepoFacts, RepoMeta } from "../types/facts.js";
import type { Logger } from "../utils/log.js";
/**
 * 第一步：从仓库文件中提取结构化 RepoFacts。
 */
export declare function extractFacts(files: FileContent[], repoMeta: RepoMeta, provider: Provider, log: Logger): Promise<RepoFacts>;
//# sourceMappingURL=extract.d.ts.map