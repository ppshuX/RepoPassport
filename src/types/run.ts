/** 步骤状态 */
export type StepStatus =
  | { status: "pending" }
  | { status: "running"; startedAt: string }
  | { status: "completed"; completedAt: string }
  | { status: "failed"; error: string; at: string }
  | { status: "partial_failure"; error: string; at: string }
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
  /** 重试标记：前一次失败的 runId */
  retryOf?: string;
}

/** 提交失败时保留的恢复信息 */
export interface SubmitRecoveryInfo {
  /** 失败发生在哪个步骤 */
  failedAt: "fork" | "branch" | "commit" | "push" | "pr_create" | "pr_record";
  /** 已创建的远程资源（不自动删除） */
  remoteResources: {
    forkUrl?: string;
    forkOwner?: string;
    branchName?: string;
    remotePushed?: boolean;
  };
  /** 用户可执行的恢复命令 */
  recoveryCommands: string[];
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
  /** partial_failure 时的恢复信息 */
  recoveryInfo?: SubmitRecoveryInfo;
}
