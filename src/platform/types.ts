import type { Logger } from "../utils/log.js";

/** 支持的 Git 托管平台 */
export type PlatformType = "github" | "gitee" | "acgit";

/** URL 解析结果 */
export interface ParsedRepoUrl {
  platform: PlatformType;
  owner: string;
  name: string;
  originalUrl: string;
}

/** Fork 操作结果 */
export interface ForkResult {
  forkUrl: string;
  forkOwner: string;
}

/** 创建 PR/MR 参数 */
export interface CreatePrParams {
  targetOwner: string;
  targetRepo: string;
  baseBranch: string;
  headUser: string;
  headBranch: string;
  title: string;
  body: string;
}

/** 创建 PR/MR 结果 */
export interface CreatePrResult {
  prUrl: string;
  prNumber: number;
}

/** PR/MR 状态查询结果 */
export interface PrStatus {
  state: string;
  mergedAt: string | null;
  closedAt: string | null;
}

/**
 * 平台适配器 —— 每个托管平台实现该接口。
 * git clone / branch / commit / push 是平台无关的通用操作，
 * 但 URL 解析、Fork、PR 创建、状态查询因平台而异。
 */
export interface PlatformAdapter {
  readonly type: PlatformType;
  readonly displayName: string;

  /** 从 URL 解析 owner/name；非本平台返回 null */
  parseRepoUrl(url: string): ParsedRepoUrl | null;

  /** 检查平台前置条件（CLI 是否安装、Token 是否配置） */
  checkPrerequisites(log: Logger): void;

  /** Fork 仓库到当前用户 */
  forkRepo(owner: string, repo: string, log: Logger): Promise<ForkResult>;

  /** 创建 Draft PR/MR */
  createDraftPr(params: CreatePrParams, log: Logger): Promise<CreatePrResult>;

  /** 查询 PR/MR 状态 */
  viewPr(prUrl: string, log: Logger): Promise<PrStatus>;
}
