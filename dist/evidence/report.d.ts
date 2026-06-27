import type { RepoFacts } from "../types/facts.js";
import type { ContentEvidenceMap } from "../types/run.js";
/**
 * 生成内容到证据的映射。
 */
export declare function buildContentEvidenceMap(generatedReadme: string, facts: RepoFacts): ContentEvidenceMap[];
/**
 * 格式化证据报告，用于终端输出。
 */
export declare function formatEvidenceReport(facts: RepoFacts, contentEvidenceMap: ContentEvidenceMap[]): string;
//# sourceMappingURL=report.d.ts.map