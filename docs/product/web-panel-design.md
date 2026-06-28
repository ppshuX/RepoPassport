# RepoPassport Web 操作台架构设计

版本：v0.1.0
日期：2026-06-28
状态：设计稿
前置阅读：docs/product/mvp-design.md

## 1. 目标

将 RepoPassport 从纯 CLI 工具升级为"本地 Web 操作台 + CLI"。用户在浏览器中 `localhost:3000` 访问，输入仓库 URL → 点击分析 → 实时看到进度 → 预览生成的 README Diff → 点击提交 PR。CLI 命令保持不变，与 Web 共用同一套核心分析管线。

核心原则：重构不改功能。现有 CLI 行为完全不退化。

## 2. 技术方案：选项 A — 抽离服务层

当前代码已经有良好的模块边界（`repo/`、`ai/`、`platform/`、`evidence/`），但 `commands/prepare.ts` 将管线编排、终端交互（readline、console.log）、错误处理全部耦合在一起。重构策略：

1. 将 `prepare.ts` 中的管线逻辑抽成 `PipelineCoordinator`（事件驱动，不绑定终端）
2. CLI 和 Web 后端各自实现事件处理（终端展示 vs WebSocket 推送）
3. 文件收集模块泛化为多语言支持
4. 前端用 React + Vite + Tailwind 构建操作台界面

## 3. 新模块结构

```
src/
├── index.ts                  # CLI 入口（不变）
├── cli/
│   ├── prepare.ts            # CLI 适配层（调用 pipeline，处理终端交互）
│   └── status.ts             # 不变
├── pipeline/
│   └── pipeline.ts           # PipelineCoordinator（核心管线，事件驱动）
├── services/
│   ├── analysis.ts           # 分析服务（clone→collect→extract→generate→evidence）
│   └── submit.ts             # 提交服务（fork→branch→commit→push→pr）
├── repo/                     # 不变，增强多语言文件收集
│   ├── clone.ts
│   ├── files.ts              # 增强：多语言文件检测
│   ├── cleanup.ts
├── ai/                       # 不变
│   ├── client.ts
│   ├── extract.ts
│   └── generate.ts
├── platform/                 # 不变
│   ├── index.ts
│   ├── types.ts
│   ├── github.ts
│   ├── gitee.ts
│   └── acgit.ts
├── evidence/                 # 不变
│   └── report.ts
├── pr/                       # 不变
│   └── git.ts
├── store/                    # 不变
│   └── runs.ts
├── validate/                 # 不变
│   └── facts.ts
├── types/                    # 不变
│   ├── facts.ts
│   ├── run.ts
│   └── config.ts
├── utils/
│   ├── log.ts                # 增强：BufferedLogger
│   ├── diff.ts
│   └── env.ts
└── web/                      # 新增：Web 操作台
    ├── server.ts             # Express + WebSocket 服务器
    ├── routes.ts             # REST API 路由
    ├── ws.ts                 # WebSocket 进度推送
    └── index.ts              # Web 服务启动入口

client/                        # 新增：前端 SPA
├── index.html
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── UrlInput.tsx      # URL 输入面板
│   │   ├── ProgressSteps.tsx # 进度步骤条
│   │   ├── ReadmePreview.tsx # README Diff 预览
│   │   ├── EvidencePanel.tsx # 证据报告面板
│   │   └── SubmitPanel.tsx   # 提交确认面板
│   └── hooks/
│       ├── useWebSocket.ts   # WebSocket 连接管理
│       └── usePipeline.ts    # 管线状态管理
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 4. PipelineCoordinator — 核心抽象

这是整个重构的关键。PipelineCoordinator 是一个事件驱动的管线协调器，不依赖任何终端或 Web 框架。

```typescript
// pipeline/pipeline.ts

export interface PipelineEvent {
  type: "step:start" | "step:complete" | "step:error" | "progress" | "result";
  step?: "clone" | "extract" | "generate" | "review" | "submit";
  data?: unknown;
  message?: string;
}

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineConfig {
  repoUrl: string;
  provider: "openai" | "mock";
  model?: string;
  submit: boolean;
  onEvent: PipelineEventHandler;
}

export interface PipelineResult {
  runId: string;
  facts: RepoFacts;
  generatedReadme: string;
  filteredReadme: string;
  chineseReadme?: string;
  evidenceMap: ContentEvidenceMap[];
  cloneResult: { tempDir: string; meta: RepoMeta };
  platform: PlatformType;
  prUrl?: string;
  submitRecoveryInfo?: SubmitRecoveryInfo;
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult>;
```

PipelineCoordinator 内部顺序执行：
1. 前置检查 → 事件 `step:start/clone`
2. 克隆仓库 → 事件 `step:complete/clone`
3. 收集文件（多语言）→ 事件 `progress`
4. AI 事实提取 → 事件 `step:start/extract` → `step:complete/extract`
5. README 生成 → 事件 `step:start/generate` → `step:complete/generate`
6. 证据映射 → 事件 `step:complete/review`
7. 结果返回 → 事件 `result`
8. 若 submit=true，外部调用 `submitService.run()` → 事件 `step:start/submit` → `step:complete/submit`

注意：PipelineCoordinator 只在 analyze 阶段返回结果，不内置确认等待。确认逻辑交给 CLI 的 readline 或 Web 前端的按钮点击。Submit 阶段作为独立服务单独调用。

## 5. 文件收集增强 — 多语言支持

当前 `collectFiles` 仅针对 JS/TS 生态。重构后支持多语言检测：

| 语言/生态 | 检测信号 | 必读文件 | 源码目录 |
|-----------|----------|----------|----------|
| **JS/TS (已有)** | `package.json` | package.json, tsconfig.json, README.md, src/index.ts | `src/`, `lib/` |
| **Python** | `requirements.txt`, `pyproject.toml`, `setup.py` | pyproject.toml, README.md, src/*/__init__.py | `src/`, `lib/` |
| **Go** | `go.mod` | go.mod, README.md, main.go, cmd/ | `.`, `cmd/`, `internal/` |
| **Rust** | `Cargo.toml` | Cargo.toml, README.md, src/lib.rs, src/main.rs | `src/` |
| **Java/Kotlin** | `pom.xml`, `build.gradle`, `build.gradle.kts` | pom.xml/build.gradle, README.md, src/main/ | `src/main/` |
| **C/C++** | `CMakeLists.txt`, `Makefile` | CMakeLists.txt, README.md, src/ | `src/` |
| **Ruby** | `Gemfile` | Gemfile, README.md, lib/ | `lib/` |
| **PHP** | `composer.json` | composer.json, README.md, src/ | `src/` |
| **C#/.NET** | `*.csproj`, `*.sln` | *.csproj, README.md | 项目根目录 |
| **多语言混用** | 多个信号同时存在 | 按优先级收集 | 按各自约定 |

实现策略：
- 检测阶段：扫描仓库根目录，识别存在的生态文件
- 收集阶段：按检测到的生态收集对应的高价值文件
- Token 预算依然是 8000，多语言时每种生态至少收集配置文件和 1-2 个核心源码文件
- AI prompt 中告知检测到的语言/生态，帮助 AI 准确提取事实

## 6. Logger 重构

当前 `Logger` 直接写 `console.log`。Web 版本需要能缓冲日志并通过 WebSocket 推送。

```typescript
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  verbose(msg: string): void;
}

// CLI 用
export function createConsoleLogger(verbose: boolean): Logger;

// Web 用（缓冲 + 回调）
export function createBufferedLogger(
  onLog: (level: "info" | "warn" | "error" | "verbose", msg: string) => void
): Logger;
```

## 7. Web 后端设计

### 技术栈
- **Express.js** — HTTP 服务器，处理 REST API
- **ws** — WebSocket 服务器，推送实时进度
- 端口 3617（默认）

### REST API

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/analyze` | 开始分析仓库，返回 `runId` |
| `GET` | `/api/runs/:runId` | 获取运行结果（facts、readme、evidence） |
| `POST` | `/api/runs/:runId/submit` | 提交 Draft PR |
| `GET` | `/api/runs` | 列出历史运行记录 |
| `GET` | `/api/prs` | 列出 PR 记录 |
| `POST` | `/api/validate-url` | 校验仓库 URL 是否合法 |

请求体 `POST /api/analyze`：
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

响应 `POST /api/analyze`：
```json
{
  "runId": "uuid",
  "status": "started"
}
```

响应 `GET /api/runs/:runId`：
```json
{
  "runId": "uuid",
  "status": "completed" | "running" | "failed",
  "steps": {
    "clone": "completed",
    "extract": "completed",
    "generate": "completed",
    "review": "completed",
    "submit": "skipped"
  },
  "result": {
    "repo": { "owner": "...", "name": "..." },
    "filteredReadme": "# ...",
    "chineseReadme": "# ...",
    "evidenceMap": [...]
  }
}
```

### WebSocket 协议

连接 `ws://localhost:3617/ws?runId=<uuid>`

服务端推送消息格式：
```json
{
  "type": "step:start" | "step:complete" | "progress" | "error" | "log",
  "step": "clone" | "extract" | "generate" | "review" | "submit",
  "message": "正在克隆仓库...",
  "data": {}
}
```

### 安全
- 只监听 `127.0.0.1`（localhost only）
- CORS 限定 localhost 来源
- URL 校验沿用 `validateRepoUrl()` 逻辑
- 不暴露 API Key 到前端（Provider 配置在服务端）

## 8. 前端设计

### 页面布局

```
┌─────────────────────────────────────────────────────┐
│  RepoPassport 操作台                                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ 仓库 URL: [https://github.com/owner/repo  ]   │  │
│  │ Model: [gpt-4o-mini ▼]  [开始分析]            │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  步骤进度:                                           │
│  ● 克隆仓库 ──● 事实提取 ──○ 文档生成 ──○ 审核  │
│                                                      │
│  ┌── README 预览 ───┬── 证据报告 ─────────────────┐ │
│  │                  │                             │  │
│  │ ## Installation  │ ## Tech Stack               │  │
│  │ npm install ...  │ ✓ TypeScript (package.json) │  │
│  │                  │ ✓ Node.js (package.json)    │  │
│  │ ## Usage         │                             │  │
│  │ import { ... }   │ ## Installation             │  │
│  │                  │ ✓ scripts (package.json)    │  │
│  │ ...              │                             │  │
│  └──────────────────┴─────────────────────────────┘  │
│                                                      │
│  [保存草稿]  [提交 Draft PR]  模式: Dry-run         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 交互流程

1. 用户输入 URL → 点击"开始分析"
2. 进度条逐步更新（WebSocket 推送）
3. 分析完成后，左侧显示生成的 README（Diff 视图），右侧显示证据报告
4. 用户检查内容 → 可以选择"保存草稿"或"提交 Draft PR"
5. 点击"提交 Draft PR"后弹出确认框 → 确认后执行提交
6. 提交结果展示 PR URL

### 状态管理
- 用 React state + useReducer 管理管线状态
- WebSocket hook 自动重连
- 错误显示 toast 通知

### UI 风格
- 深色主题操作台风格（Terminal-like）
- 等宽字体用于代码/Diff 展示
- 绿色/红色表示新增/删除的行
- 信用指标可视化（置信度进度条）

## 9. 实施计划（分 5 个阶段）

### 阶段 1：抽离核心管线（1 天）

- [ ] 创建 `pipeline/pipeline.ts` — `runPipeline()`
- [ ] 从 `commands/prepare.ts` 中提取纯逻辑到 `services/analysis.ts`
- [ ] 将 `console.log` 调用替换为 `onEvent` 回调
- [ ] 重构 `Logger`：接口不变，增加 `BufferedLogger` 实现
- [ ] 验证：CLI `prepare` 命令行为完全不变，现有测试全通过

### 阶段 2：多语言文件收集（0.5 天）

- [ ] 增强 `repo/files.ts`：增加多语言检测逻辑
- [ ] 增加多语言配置文件 + 源码目录的识别
- [ ] AI prompt 中增加语言/生态上下文
- [ ] 验证：Python、Go、Rust 仓库能正确收集文件

### 阶段 3：Web 后端（1 天）

- [ ] 创建 `web/server.ts` — Express 服务器
- [ ] 创建 `web/routes.ts` — REST API
- [ ] 创建 `web/ws.ts` — WebSocket 进度推送
- [ ] 实现 `POST /api/analyze`（调用 `runPipeline`）
- [ ] 实现 `POST /api/runs/:runId/submit`
- [ ] CLI 增加 `repopassport web` 命令启动 Web 服务
- [ ] 安全：限 localhost、URL 校验

### 阶段 4：前端操作台（1.5 天）

- [ ] Vite + React + Tailwind 项目初始化
- [ ] `UrlInput` 组件（URL 输入 + 参数选择）
- [ ] `ProgressSteps` 组件（步骤进度条，WebSocket 驱动）
- [ ] `ReadmePreview` 组件（Diff 视图，左侧原文右侧生成）
- [ ] `EvidencePanel` 组件（证据映射展示）
- [ ] `SubmitPanel` 组件（提交确认）
- [ ] WebSocket 连接管理 hook
- [ ] 响应式布局

### 阶段 5：集成测试与收尾（0.5 天）

- [ ] 端到端手动测试（3 个真实仓库 + 不同语言）
- [ ] CLI 回归测试
- [ ] Web 服务启动脚本优化
- [ ] 清理临时文件逻辑验证（Web 模式下 pipeline 完成后清理）

总计估算：4-5 天（单人）。

## 10. 技术决策与边界

### 为什么不用 CodeBuddy Agent SDK

RepoPassport 有自己的 AI 管线（OpenAI-compatible client、结构化事实提取、Zod 校验、证据报告），这些已经经过打磨。Agent SDK 是通用对话框架，引入它需要改写整个 AI 调用链，成本高且没有收益。Web 后端只需要 Express + WebSocket，极简即可。

### 为什么不用数据库

MVP 阶段保持本地 JSON 存储（`~/.repopassport/`）。数据库（SQLite）留到 v0.3。

### 支持所有语言的边界

"支持所有语言"指的是文件收集和 AI 分析不限语言。但不是"对所有语言都一样好"——JS/TS 项目在文件筛选和 prompt 上仍然有最丰富的经验，其他语言逐步完善。Python 和 Go 作为第二梯队优先支持。

### 安全边界
- Web 服务仅监听 localhost，不对外暴露
- 不引入用户认证（本地使用无需登录）
- API Key 仅在服务端环境变量中读取
- URL 校验沿用 CLI 的安全规则（shell 注入防护）

## 11. 不做的

- 远程部署（这是本地操作台）
- 用户认证/多用户
- 数据库存储
- CI/CD 集成
- 批量处理
- 自动同步（v0.2）
- 移动端适配
