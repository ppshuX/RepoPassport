/** 证据来源类型 */
export type SourceType = "file" | "config" | "dependency" | "export";

/** 提取方式 */
export type ExtractionMethod = "static" | "ai-inferred";

/** 事实类别 */
export type FactCategory =
  | "project_name"
  | "description"
  | "purpose"
  | "tech_stack"
  | "installation"
  | "usage"
  | "configuration"
  | "api_surface"
  | "architecture"
  | "dependencies";

/** 单条证据 */
export interface Evidence {
  sourceType: SourceType;
  filePath: string;
  commitSha: string;
  symbol?: string;
  lineRange?: [number, number];
  confidence: number;
  extractionMethod: ExtractionMethod;
}

/** 单条事实 */
export interface FactsItem {
  category: FactCategory;
  content: string;
  evidence: Evidence[];
  combinedConfidence: number;
}

/** 仓库元信息 */
export interface RepoMeta {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  commitSha: string;
}

/** 仓库事实集合 */
export interface RepoFacts {
  repo: RepoMeta;
  analyzedAt: string;
  items: FactsItem[];
  overallConfidence: number;
}

/** 文件内容 */
export interface FileContent {
  path: string;
  content: string;
  size: number;
}
