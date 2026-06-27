/** 步骤状态 */
export type StepStatus =
  | { status: "pending" }
  | { status: "running"; startedAt: string }
  | { status: "completed"; completedAt: string }
  | { status: "failed"; error: string; at: string }
  | { status: "skipped" };

/** 内容到证据的映射 */
export interface ContentEvidenceMap {
  section: string;
  content: string;
  evidenceRefs: number[];
  hasEvidence: boolean;
}

/** 文档草稿 */
export interface DocumentDraft {
  id: string;
  runId: string;
  originalReadme?: string;
  generatedReadme: string;
  factsRef: string;
  contentEvidenceMap: ContentEvidenceMap[];
}

import type { PlatformType } from "../platform/index.js";

/** PR 记录 */
export interface PullRequestRecord {
  id: string;
  runId: string;
  platform: PlatformType;
  prUrl: string;
  targetRepo: string;
  forkUrl: string;
  branchName: string;
  createdAt: string;
  status: "open" | "closed" | "merged" | "unknown";
  mergedAt?: string;
  closedAt?: string;
  lastCheckedAt: string;
}

/** 一次生成运行 */
export interface GenerationRun {
  id: string;
  repoUrl: string;
  platform: PlatformType;
  startedAt: string;
  completedAt?: string;
  steps: {
    clone: StepStatus;
    extract: StepStatus;
    generate: StepStatus;
    review: StepStatus;
    submit: StepStatus;
  };
  draftId?: string;
  prRecordId?: string;
}
