# RepoPassport 使用手册

版本：v0.1.0
最后更新：2026-06-28

## 1. 项目简介

RepoPassport 是一站式开源文档贡献工具，帮助开发者为喜爱的中文开源项目生成英文 README 并提交 Draft PR。典型场景：你发现一个优秀的纯中文开源项目，想帮它写一份英文 README 让国际开发者能够理解和使用——RepoPassport 帮你完成从分析仓库到提交 PR 的完整闭环。

核心能力：

- 浅克隆公开仓库并自动识别项目语言和生态
- AI 驱动的事实提取（项目名、用途、技术栈、安装方式、API 面），每项附带代码证据
- 基于已验证事实生成克制的中文和英文 README（禁止编造内容）
- 证据报告展示每段内容对应的源文件、符号和行号范围
- 一键 Fork + Branch + Commit + Push + Draft PR
- 本地 Web 操作台（Vite + React + Tailwind）和经典 CLI 两套入口共用同一分析管线

目前支持的代码仓库平台包括 GitHub、Gitee 和 ACGit（git.woa.com）。支持的编程语言包括 JavaScript/TypeScript、Python、Go、Rust、Java/Kotlin、C/C++、Ruby、PHP、C#/.NET 及多语言混用项目。

## 2. 安装

### 前置条件

Node.js 版本不低于 18。git 已安装并可在命令行中直接执行。如需提交 PR，需要安装并在平台登录对应的 CLI 工具：GitHub 使用 gh CLI（`gh auth login`），Gitee 使用 gitee CLI，ACGit 使用对应凭证。

### 从源码安装

```bash
git clone <repo-url>
cd RepoPassport
npm install
npm run build          # 编译后端 TypeScript
npm run build:client   # 编译前端 React 应用
```

全局安装后即可从任意目录使用 `repopassport` 命令：

```bash
npm link
```

### 配置 AI Provider

在 `~/.repopassport/.env` 中设置 API Key（不覆盖命令行已设置的环境变量）：

```bash
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini        # 可选，默认 gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，兼容 DeepSeek 等
```

未配置 API Key 时默认使用 Mock Provider 生成示例数据，可用于体验完整流程。

## 3. CLI 命令

### prepare — 分析仓库并生成英文 README

```bash
repopassport prepare <repo-url> [options]
```

示例：

```bash
# 分析 GitHub 仓库（默认 mock 模式，无需 API Key）
repopassport prepare https://github.com/antfu/utils

# 使用 OpenAI 真实分析
repopassport prepare https://github.com/colinhacks/zod --provider openai

# 分析完成后提交 Draft PR
repopassport prepare https://github.com/unjs/pathe --provider openai --submit

# 将草稿输出到文件
repopassport prepare https://github.com/antfu/utils --output draft.md

# 分析 Gitee 仓库
repopassport prepare https://gitee.com/thinkgem/jeesite4
```

选项：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-p, --provider <name>` | string | 自动检测 | AI Provider（openai / mock）。有 OPENAI_API_KEY 时默认 openai |
| `-m, --model <name>` | string | gpt-4o-mini | 指定模型名称 |
| `--submit` | boolean | false | 审核确认后执行 Fork + Draft PR 提交 |
| `-o, --output <path>` | string | stdout | 将草稿写入指定文件路径 |
| `-y, --yes` | boolean | false | 跳过交互确认，自动保存草稿文件 |
| `--verbose` | boolean | false | 输出详细日志 |

执行流程：

1. 前置检查（git 可用）
2. 浅克隆仓库到临时目录（depth=1）
3. 自动检测语言生态，收集高价值文件（配置文件、README、核心源码）
4. AI 提取结构化仓库事实（RepoFacts），每项附带证据
5. Zod 校验事实数据完整性，丢弃无效项
6. AI 生成英文 README 草稿
7. 证据映射 + 无证据内容过滤
8. 终端展示 Diff 预览和证据报告
9. 用户确认后（`--submit` 模式下）执行 Fork + Draft PR 提交流程

### status — 查询已提交 PR 状态

```bash
repopassport status <pr-url>
```

示例：

```bash
repopassport status https://github.com/nestjs/nest/pull/12345
```

输出 JSON 格式的状态信息，包含 `state`、`mergedAt`、`closedAt`、`url` 字段。

### web — 启动 Web 操作台

```bash
repopassport web              # 默认监听 127.0.0.1:3617
repopassport web --port 8080  # 自定义端口
```

启动后在浏览器访问 http://127.0.0.1:3617 打开操作台界面。Web 操作台提供与 CLI 相同的分析管线，增加了实时进度显示、中英文 README 并排预览和证据可视化面板。

### 全局选项

```bash
repopassport --help       # 显示帮助
repopassport --version    # 显示版本号
```

## 4. Web 操作台

### 启动方式

```bash
# 编译后端和前端
npm run build
npm run build:client

# 启动 Web 操作台
npm run web

# 开发模式（前端热重载，自动代理后端 API）
npm run dev:client
```

访问 http://127.0.0.1:3617（生产模式）或 http://localhost:3000（开发模式）。

### 界面布局

操作台分为五个功能区：

**URL 输入面板** — 输入仓库地址，支持 GitHub、Gitee、ACGit 三种平台。可选 Provider 和 Model 参数。点击"开始分析"启动管线。URL 格式预校验实时反馈合法性。

**进度步骤条** — 实时显示分析进度：克隆仓库 → 事实提取 → 文档生成 → 证据审查 → 提交（可选）。每个步骤通过 WebSocket 推送状态更新（pending / running / completed / failed）。

**README 预览区** — 分析完成后展示生成的 README。中英文 tab 切换。无证据支撑的章节被自动过滤，以保障内容可信度。

**证据报告面板** — 展示每项事实的证据来源：来源文件路径、证据类型（文件/配置/依赖/导出）、置信度评分、提取方式（静态解析或 AI 推断）。

**提交操作面板** — 用户审核内容后，可选择保存草稿到本地或执行 Fork + Draft PR 提交。提交过程通过 WebSocket 实时推送进度。

### WebSocket 协议

连接地址：`ws://127.0.0.1:3617/ws?runId=<uuid>`

推送消息格式：

```json
{
  "type": "step:start | step:complete | progress | error | log | result",
  "step": "clone | extract | generate | review | submit",
  "message": "人类可读的描述",
  "data": {}
}
```

### REST API 参考

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/analyze` | 开始分析仓库。Body: `{"repoUrl": "...", "provider": "openai", "model": "gpt-4o-mini"}`。返回 `{"runId": "...", "status": "started"}` |
| `GET` | `/api/runs/:runId` | 获取运行结果。返回完整步骤状态和生成内容 |
| `POST` | `/api/runs/:runId/submit` | 提交 Draft PR。分析完成后调用 |
| `GET` | `/api/runs` | 列出历史运行记录（最近 20 条） |
| `POST` | `/api/validate-url` | 校验仓库 URL 是否合法。返回 `{"valid": true, "platform": "github"}` |

### 安全措施

Web 服务仅监听 127.0.0.1（不对外暴露）。CORS 限制仅允许 localhost 来源。API Key 仅在服务端环境变量中读取，不通过 API 暴露给前端。URL 输入沿用 CLI 安全规则进行注入防护。

## 5. 工作原理

### 分析管线

管线按以下顺序执行，每步通过事件回调推送进度：

1. **平台检测** — 解析 URL 识别 GitHub / Gitee / ACGit / 本地仓库
2. **前置检查** — 验证 git 可用
3. **浅克隆** — `git clone --depth=1` 到临时目录（`os.tmpdir()` + 随机子目录）
4. **文件收集** — 自动检测项目语言生态，按优先级收集配置文件、README 和核心源码文件。目标总 Token 不超过 8000。低价值文件（node_modules、dist、测试文件、二进制）跳过
5. **事实提取** — AI 从源代码中提取结构化事实（项目名、用途、技术栈、安装方式、API 面等），每个事实项附带 Evidence（来源文件、符号名、行号范围、置信度）。Zod Schema 校验输出完整性，丢弃无效项。有效项不足 3 时终止
6. **README 生成** — AI 基于已验证事实生成英文 README 草稿，严格遵循"无证据不生成"原则。若仓库尚无 README，同时生成中文版本
7. **证据映射** — 将生成的 README 内容与事实证据建立双向映射，标注每段内容的证据支撑状态。无证据章节被自动过滤
8. **审核展示** — CLI 终端展示 Diff 视图和证据报告；Web 操作台左侧预览右侧证据面板
9. **提交（可选）** — 用户确认后执行 Fork → Branch → Commit → Push → Draft PR 完整流程。任一步失败即回滚本地状态，并提供恢复指引

### 文件收集策略

项目检测到的主要生态文件包括 package.json（JS/TS）、pyproject.toml 和 requirements.txt（Python）、go.mod（Go）、Cargo.toml（Rust）、pom.xml 和 build.gradle（Java/Kotlin）、CMakeLists.txt（C/C++）、Gemfile（Ruby）、composer.json（PHP）、*.csproj 和 *.sln（C#/.NET）。多语言混用项目会同时收集多种生态的核心文件。

### 幻觉控制

两层防护。第一层为 Prompt 约束：AI 必须为每个事实项提供源文件中找到的具体证据，禁止基于包名猜测项目用途，技术栈项必须来自配置文件。第二层为 Zod 校验：运行时验证输出 JSON 结构的完整性，单个无效项被丢弃，整体不足 3 项有效事实时终止流水线。生成阶段额外执行证据映射和过滤，无证据支撑的 README 章节被自动移除。

### 数据存储

运行记录保存在 `~/.repopassport/` 目录下。包含 runs（GenerationRun JSON）、drafts（DocumentDraft JSON）和 prs（PullRequestRecord JSON）三个子目录。内存 Map 作为 Web 模式下的运行时缓存。不依赖任何数据库。

## 6. 项目结构

```
RepoPassport/
├── src/                        # 后端源码（29 个 TypeScript 文件）
│   ├── index.ts                # CLI 入口（Commander 注册）
│   ├── commands/
│   │   ├── prepare.ts          # prepare 命令适配层（CLI 交互）
│   │   └── status.ts           # status 命令实现
│   ├── pipeline/
│   │   └── pipeline.ts         # 核心分析管线协调器（事件驱动，框架无关）
│   ├── services/
│   │   └── submit.ts           # 提交流程（Fork→Branch→Commit→Push→PR）
│   ├── repo/
│   │   ├── clone.ts            # 仓库克隆与 URL 校验
│   │   ├── files.ts            # 多语言文件收集（9 种生态）
│   │   └── cleanup.ts          # 临时目录清理
│   ├── ai/
│   │   ├── client.ts           # OpenAI-compatible SDK 封装
│   │   ├── extract.ts          # 事实提取 prompt 与调用
│   │   └── generate.ts         # README 生成 prompt 与调用（中/英）
│   ├── platform/
│   │   ├── index.ts            # 平台检测与路由
│   │   ├── types.ts            # 平台适配器类型
│   │   ├── github.ts           # GitHub 适配器
│   │   ├── gitee.ts            # Gitee 适配器
│   │   └── acgit.ts            # ACGit 适配器
│   ├── evidence/
│   │   └── report.ts           # 证据映射与格式化
│   ├── pr/
│   │   └── git.ts              # Git 操作封装
│   ├── store/
│   │   └── runs.ts             # 本地 JSON 存储
│   ├── validate/
│   │   └── facts.ts            # Zod Schema 定义与校验
│   ├── types/
│   │   ├── facts.ts            # RepoFacts / Evidence 类型
│   │   ├── run.ts              # GenerationRun / DocumentDraft 类型
│   │   └── config.ts           # ProviderConfig / PrepareOptions 类型
│   ├── utils/
│   │   ├── log.ts              # Logger（Console / Buffered 双实现）
│   │   ├── diff.ts             # 终端 Diff 展示
│   │   └── env.ts              # 环境变量加载
│   └── web/
│       ├── server.ts           # Express + WebSocket 服务器
│       ├── routes.ts           # REST API 路由
│       └── ws.ts               # WebSocket 连接管理
├── client/                     # 前端 SPA（React + Vite + Tailwind）
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── main.tsx            # React 挂载入口
│       ├── App.tsx             # 根组件（状态路由）
│       ├── index.css           # Tailwind + 自定义样式
│       ├── components/
│       │   ├── UrlInput.tsx    # URL 输入与校验
│       │   ├── ProgressSteps.tsx # 步骤进度条
│       │   ├── ReadmePreview.tsx # 中/英 README 预览（含 Diff 高亮）
│       │   ├── EvidencePanel.tsx  # 证据报告面板
│       │   └── SubmitPanel.tsx    # 提交确认与草稿保存
│       └── hooks/
│           ├── useWebSocket.ts # WebSocket 连接管理（含自动重连）
│           └── usePipeline.ts  # 管线状态 Reducer
├── tests/                      # 测试文件（8 个文件，60 个测试用例）
│   ├── url.test.ts             # URL 解析与校验
│   ├── validate.test.ts        # Zod Schema 校验逻辑
│   ├── diff.test.ts            # Diff 格式化
│   ├── report.test.ts          # 证据报告生成
│   ├── safety.test.ts          # 安全边界（shell 注入、密钥泄露）
│   ├── status.test.ts          # PR 状态记录
│   ├── store.test.ts           # JSON 存储读写
│   └── prepare.integration.test.ts # 完整管线集成测试（Mock Provider）
├── fixtures/                   # 测试夹具（sample-repo）
├── docs/                       # 文档
│   ├── research/               # 市场调研
│   ├── product/                # 产品设计文档
│   └── user-guide.md           # 本文档
├── package.json
└── tsconfig.json
```

## 7. 开发指南

### 常用命令

```bash
npm run build          # 编译后端 TypeScript → dist/
npm run build:client   # 编译前端 React → client/dist/
npm run dev:client     # 启动前端开发服务器（热重载，端口 3000）
npm run test           # 运行全部测试
npm run test:watch     # 监听模式运行测试
npm run typecheck      # TypeScript 类型检查（不输出文件）
npm run web            # 编译后启动 Web 操作台
```

### 测试概况

8 个测试文件，60 个测试用例全部通过。覆盖：

单元测试：URL 解析（13 个用例）、Zod 校验（14 个用例）、Diff 格式化（3 个用例）、证据报告（3 个用例）、安全边界（11 个用例）、PR 状态记录（4 个用例）、JSON 存储（6 个用例）

集成测试：完整分析管线闭环（6 个用例），使用 Mock Provider 模拟 AI 调用，覆盖克隆、文件收集、事实提取、文档生成、证据映射和 Diff 预览全流程。每次测试使用独立临时 fixture 仓库，执行后清理。

测试命令：`npm test`，耗时约 5-6 秒。

### 修改管线行为

管线核心在 `src/pipeline/pipeline.ts` 中的 `runPipeline()` 函数。它是纯协调器，不依赖终端或 Web 框架。修改管线逻辑只需编辑此文件。CLI 和 Web 后端通过 `PipelineEventHandler` 回调各自处理进度展示。

### 添加新的平台支持

1. 在 `src/platform/` 中创建新适配器文件，实现 `PlatformAdapter` 接口
2. 在 `src/platform/index.ts` 的 `detectPlatform()` 中注册新平台
3. 无需修改管线或前端代码

### 添加新的语言生态

编辑 `src/repo/files.ts` 中的 `LANGUAGE_ECOSYSTEMS` 数组，添加新语言的定义（名称、检测信号文件、配置文件列表、源码目录列表）。AI prompt 会自动注入语言上下文。

## 8. 故障排除

### git 未找到

命令行输出"未找到 git。请安装 git: https://git-scm.com"。安装 git 并确保其在 PATH 中即可。

### OPENAI_API_KEY 未设置

使用 `--provider mock` 跳过真实 AI 调用，或设置环境变量 `OPENAI_API_KEY=sk-...`。Mock Provider 返回预置示例数据，可用于验证管线完整性。

### 端口 3617 被占用

Web 操作台启动失败并提示"Port 3617 is already in use"。使用 `repopassport web --port 8080` 切换端口，或关闭占用 3617 端口的进程。

### 前端空白页面

如果访问 http://127.0.0.1:3617 时看到"please build the frontend first"，表示前端尚未编译。运行 `npm run build:client` 后刷新页面。

### 克隆失败

检查仓库 URL 是否正确、仓库是否为公开仓库、网络是否可达。支持 GitHub.com、Gitee.com 和 git.woa.com 三种平台。本地仓库路径也受支持（用于测试）。

### AI 事实提取失败

Zod 校验后有效事实项不足 3 项时会终止。可能原因包括仓库文件过少、AI 返回格式异常。使用 `--verbose` 查看详细日志。切换到 Mock Provider 可确认是否为 AI Provider 问题。

### 提交失败

提交管线按 Fork → Remote → Branch → Stage → Commit → Push → PR Create 顺序执行。任一步失败自动回滚本地状态（重置分支、移除 remote），并提供恢复命令指引。部分失败（如 Fork 已创建但 PR 创建失败）会保留远程资源并给出手动恢复步骤。

### API Key 安全

错误消息中的 API Key 和 Token 会被自动脱敏。提交服务的 `sanitizeForOutput()` 函数在输出前替换所有密钥为 `***REDACTED***`。环境变量文件 `~/.repopassport/.env` 权限建议设为 600。

## 9. 版本路线

| 版本 | 命令 | 功能 |
|------|------|------|
| v0.1（当前） | `prepare` / `status` / `web` | 为仓库生成英文 README，手动审核后 Draft PR。Web 操作台 |
| v0.1.1 | `sync <repo-url>` | 重新分析仓库，只更新已有英文文档发生变化的部分（手动触发） |
| v0.2 | `init` | 生成 `.github/workflows/repopassport-sync.yml`，仓库主人安装后 Push 事件自动触发文档漂移检测和增量同步 PR |

当前 v0.1 的核心分析管线（浅克隆 → 文件筛选 → RepoFacts 提取 → 文档生成）未来可直接嵌入 GitHub Actions，从手动运行升级为 Push 事件触发。

## 10. 参考文档

- [市场调研报告](research/market-research.md) — 竞品分析与差异化定位
- [MVP 设计文档](product/mvp-design.md) — 产品架构与核心数据模型
- [Web 操作台设计文档](product/web-panel-design.md) — 前端架构与 API 设计
- [README 质量评分卡](../docs/testing/readme-quality-scorecard.md) — 生成文档质量评估标准
