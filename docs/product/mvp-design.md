# RepoPassport MVP 设计文档

> 版本：v0.1.0
> 日期：2026-06-28
> 状态：设计稿，交付实现工程师
> 前置阅读：docs/research/market-research.md

## 1. 产品问题与目标

### 问题

大量中文开源项目的 README 和文档仅支持中文，使英语言开发者无法评估和使用这些项目。维护者通常缺乏时间、英语能力或动力来维护英文文档。即使第一版英文文档被贡献，随着中文文档和代码继续变化，英文文档会慢慢变成遗迹。

市场调研确认：ReadmeAI、readmeX、DeepWiki 和 Qodo Doc Writer 均可从仓库生成文档，但它们全部止步于"生成文件"——不创建 PR、不提供代码证据、不追踪贡献结果。Crowdin 和 GitLocalize 能创建翻译 PR，但不理解代码语义。没有任何产品将"证据驱动的文档生成"与"可追踪的 PR 贡献闭环"整合为单一工作流。

### 目标

MVP 目标：以最少代码跑通一次真实、可信的文档贡献闭环。用户对公开 GitHub 仓库执行一条命令，自动提取代码事实、生成英文文档草稿，经用户审核后以 Fork + Draft PR 形式提交，并本地记录 PR 状态。

RepoPassport 不只是替仓库写一份英文自我介绍，还会在项目继续长大时，提醒那本护照也该续签了。

## 2. 目标用户

- 想为喜爱的中文开源项目贡献英文文档的开发者
- 希望让项目被国际开发者发现的中文开源维护者
- 自身英语写作不自信但有贡献意愿的技术人员

## 3. 唯一核心使用场景

用户发现一个优秀的纯中文 JavaScript/TypeScript 开源项目，想帮它生成或补充英文 README，让国际开发者能够理解和使用。用户运行 `repopassport prepare <url>`，审查 AI 生成的英文文档草稿及其证据引用后，确认提交为 Draft PR 到原仓库。之后可查询 PR 合并状态。

## 4. 完整用户流程

```
用户 → repopassport prepare https://github.com/owner/repo
│
├─ 0. 前置检查
│   ├─ 检查 gh CLI 已安装且已登录
│   ├─ 检查 Node.js >= 18
│   └─ 检查 git 可用
│
├─ 1. 仓库分析
│   ├─ 浅克隆仓库到临时目录（depth=1）
│   ├─ 读取高价值文件列表（见第 12 节）
│   └─ 提取目录结构和依赖信息
│
├─ 2. 事实提取
│   ├─ 将筛选后的文件内容发送给 AI
│   ├─ 提取结构化 RepoFacts，每项附带 Evidence
│   └─ Zod 校验输出结构
│
├─ 3. 文档生成
│   ├─ 将 RepoFacts 作为输入发送给 AI
│   ├─ 生成英文 README 草稿
│   └─ 校验：无证据支撑的内容标记或移除
│
├─ 4. 审核展示
│   ├─ 输出统一 Diff（原 README vs 生成草稿）
│   ├─ 输出证据报告（每段对应哪个文件/符号）
│   └─ 等待用户确认：y/n/编辑
│
├─ 5. 提交（需用户确认）
│   ├─ gh repo fork --clone=false
│   ├─ git remote add fork <fork-url>
│   ├─ git checkout -b repopassport/en-readme
│   ├─ 检测英文文档命名约定，创建或更新英文 README（保留原中文 README.md 不动）
│   ├─ git add README.en.md
│   ├─ git commit -m "docs: add English README"
│   ├─ git push fork repopassport/en-readme
│   └─ gh pr create --draft --title "docs: add English README" --body "..."
│
└─ 6. 记录
    ├─ 保存 PR URL 和运行记录到本地 JSON
    └─ 输出 PR 链接
```

后续查询：
```
repopassport status <pr-url>
│
└─ 调用 gh pr view --json state,mergedAt,closedAt
   以 JSON 格式输出状态
```

## 5. MVP 功能范围

### 包含

| 功能 | 描述 |
|------|------|
| `prepare` 命令 | 完整链路：分析→提取→生成→审核→提交 |
| `status` 命令 | 查询 PR 当前状态（Open/Closed/Merged） |
| 浅克隆分析 | depth=1 克隆，读取配置、README、核心源码 |
| 结构化事实提取 | AI 从代码中提取项目名、用途、安装/使用方式、技术栈等 |
| 证据标注 | 每项事实附带 Commit SHA、来源文件路径、符号名或行号范围 |
| 英文 README 生成 | 基于已验证事实生成克制英文 README |
| 审核界面 | 终端显示 Diff + 证据报告，等待用户确认 |
| Fork + Draft PR | 通过 gh CLI 提交，默认 Draft 状态 |
| 本地 JSON 记录 | PR URL、运行时间、仓库信息 |
| 错误回滚 | 任何步骤失败不污染原仓库，仅清理临时目录 |

### 明确排除

Web 页面、独立后端服务、数据库（SQLite/PostgreSQL）、GitHub App/OAuth、Webhook 监听、向量数据库与完整 RAG、多用户/多租户、批量仓库处理、私有仓库支持、全语种翻译、无审核自动提交、自动回复维护者评论、自动处理 PR 冲突、通用代码问答、PR 数据 Dashboard。

## 6. 非目标

MVP 不做但未来可能考虑的方向仅在第 22 节中作为扩展条件提及。MVP 不承担以下任何一项：

- 成为一个"平台"——MVP 是本地 CLI 工具
- 支持非 JS/TS 项目——语言解析策略完全不同
- 保证 PR 被合并——产品负责生成高质量草稿，合并由维护者决定
- 自动化重复提交——每个仓库仅操作一次，不做批量

## 7. 技术栈及选择理由

| 技术 | 解决的问题 | 为什么适合 MVP | 为什么暂不选更复杂方案 |
|------|-----------|---------------|----------------------|
| Node.js + TypeScript | 跨平台 CLI 运行环境 | 前端/全栈开发者最熟悉的生态；NPM 分发零摩擦 | Deno/Bun 用户基数小；Rust/Go 编译分发复杂度过高 |
| Commander.js | CLI 命令定义和参数解析 | 社区最成熟，无学习成本 | Yargs 功能丰富但 API 臃肿；手写解析不可维护 |
| child_process | 调用 git 和 gh CLI | 零依赖调用系统已安装工具 | isomorphic-git 等纯 JS 实现需重新处理认证、SSH、HTTPS |
| GitHub CLI (gh) | GitHub 认证、Fork、Push、PR、状态查询 | 用户已有 gh 登录态，无需实现 OAuth 流程；gh 官方维护，PR 创建/状态查询 API 稳定 | GitHub REST API 需自行处理认证 Token、分页、错误重试；Octokit 虽可但引入额外依赖 |
| Zod | 运行时校验 AI 输出结构 | TypeScript 原生类型推断，3KB 零依赖 | Joi 更大；Yup 树摇差；手写校验不可靠 |
| OpenAI-compatible SDK | 调用 AI 模型提取事实、生成文档 | 单 Provider 降低集成复杂度；OpenAI SDK 同时兼容 DeepSeek、Moonshot 等国产模型 | LangChain 抽象层过重；多 Provider 路由增加复杂度且 MVP 无此需求 |
| 本地 JSON 文件 | 保存运行记录和 PR 信息 | 零安装、零配置、零维护 | SQLite 需编译原生模块或引入 better-sqlite3 依赖；任何数据库都需表结构和迁移 |
| Vitest | 单元测试和集成测试 | 与 Vite 生态一致，原生 ESM + TypeScript，速度极快 | Jest 配置复杂、ESM 支持弱；Node test runner 生态不成熟 |

## 8. 被否决方案及原因

### 否决：Python + Click/Typer

Python 分发 CLI 工具需要用户安装 Python 解释器和管理虚拟环境。Node.js 覆盖的前端开发者中大部分已有 Node 运行时。MVP 期不做多语言安装指南。

### 否决：GitHub App + OAuth

GitHub App 需要用户或组织安装授权、管理 Webhook secret、持有私钥——整套 OAuth 流程和密钥管理远超 MVP 需求。使用用户本地已登录的 `gh` CLI 完全够用。

### 否决：向量数据库 + 完整 RAG

市场调研确认 DeepWiki、Sourcegraph Cody 已实现仓库级理解。MVP 不需要做代码语义搜索——把筛选后的高价值文件直接放入上下文窗口即可覆盖 MVP 场景（JS/TS 单仓库）。

### 否决：Electron/Tauri 桌面应用

不是 CLI 工具。打包体积和开发复杂度与 MVP "最少代码闭环"目标冲突。

### 否决：Monorepo 多包架构

MVP 约 8-12 个源文件，单包即可。未来若还需拆分，那是 v0.3 的决策。

### 否决：自动提交 PR（无人审核）

市场调研确认 CodeRabbit Slop Detection 已在公共仓库检测低质量 AI PR。无审核自动提交既是用户体验风险也是 GitHub 生态合规风险。

## 9. CLI 命令设计

### prepare 命令

```bash
repopassport prepare <repo-url> [options]

# 示例
repopassport prepare https://github.com/antfu/vitesse
repopassport prepare https://github.com/colinhacks/zod --provider deepseek
repopassport prepare https://github.com/nestjs/nest --dry-run
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--provider, -p` | string | `openai` | AI Provider 标识 |
| `--model, -m` | string | Provider 默认值 | 指定模型名称 |
| `--dry-run` | boolean | false | 只生成文档草稿和证据报告，不执行任何 Git 操作 |
| `--output, -o` | string | stdout | 将草稿输出到指定文件而非终端展示 |
| `--verbose` | boolean | false | 输出详细日志 |

### status 命令

```bash
repopassport status <pr-url>

# 示例
repopassport status https://github.com/nestjs/nest/pull/12345
```

输出 JSON：`{ state, mergedAt, closedAt, url }`

### 全局选项

| 选项 | 说明 |
|------|------|
| `--help` | 显示帮助 |
| `--version` | 显示版本号 |
| `--config, -c` | 指定配置文件路径，默认 `~/.repopassport/config.json` |

### 配置文件格式 (`~/.repopassport/config.json`)

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "baseURL": "https://api.openai.com/v1"
  },
  "github": {
    "forkOrg": null
  }
}
```

API Key 优先读取环境变量 `${ENV_VAR}` 占位符对应值。

## 10. 系统模块划分

```
src/
├── index.ts              # CLI 入口，Commander 注册
├── commands/
│   ├── prepare.ts        # prepare 命令编排
│   └── status.ts         # status 命令实现
├── repo/
│   ├── clone.ts          # 浅克隆 + 临时目录管理
│   ├── files.ts          # 文件筛选与读取（第 12 节策略）
│   └── cleanup.ts        # 临时目录清理
├── ai/
│   ├── client.ts         # OpenAI-compatible SDK 封装
│   ├── extract.ts        # RepoFacts 提取 prompt 与调用
│   └── generate.ts       # 文档生成 prompt 与调用
├── evidence/
│   ├── annotate.ts       # 为生成内容匹配证据
│   └── report.ts         # 证据报告格式化输出
├── pr/
│   ├── git.ts            # git 操作封装（remote, branch, commit, push）
│   ├── fork.ts           # gh repo fork 封装
│   └── create.ts         # gh pr create --draft 封装
├── store/
│   └── runs.ts           # 本地 JSON 读写运行记录
├── types/
│   ├── facts.ts          # RepoFacts, Evidence 类型定义
│   ├── run.ts            # GenerationRun, DocumentDraft, PullRequestRecord
│   └── config.ts         # 配置类型定义
├── validate/
│   └── facts.ts          # Zod Schema 定义与校验
└── utils/
    ├── diff.ts           # 统一 Diff 输出
    └── log.ts            # 日志工具
```

模块依赖方向：`commands` → `repo/ai/pr/store` → `types/validate/utils`。不允许反向依赖或循环引用。

## 11. 核心数据结构

### Evidence

```typescript
interface Evidence {
  /** 证据来源类型 */
  sourceType: "file" | "config" | "dependency" | "export";
  /** 来源文件路径（相对于仓库根目录） */
  filePath: string;
  /** 提取时的 Commit SHA（浅克隆 HEAD） */
  commitSha: string;
  /** 符号名称（导出函数名、类名、配置键等） */
  symbol?: string;
  /** 行号范围 [start, end]，1-based */
  lineRange?: [number, number];
  /** AI 提取置信度 0-1 */
  confidence: number;
  /** 提取方式 */
  extractionMethod: "static" | "ai-inferred";
}

interface FactsItem {
  /** 事实类别 */
  category: "project_name" | "description" | "purpose" | "tech_stack"
    | "installation" | "usage" | "configuration" | "api_surface"
    | "architecture" | "dependencies";
  /** 事实内容（自然语言） */
  content: string;
  /** 支撑证据列表 */
  evidence: Evidence[];
  /** 综合置信度（所有 evidence 置信度均值） */
  combinedConfidence: number;
}
```

### RepoFacts

```typescript
interface RepoFacts {
  /** 仓库标识 */
  repo: {
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
    commitSha: string;
  };
  /** 分析时间 */
  analyzedAt: string;  // ISO 8601
  /** 事实项列表 */
  items: FactsItem[];
  /** 总体置信度 */
  overallConfidence: number;
}
```

### GenerationRun

```typescript
interface GenerationRun {
  /** 运行 ID（UUID v4） */
  id: string;
  /** 仓库 URL */
  repoUrl: string;
  /** 运行时间 */
  startedAt: string;
  completedAt?: string;
  /** 运行步骤及状态 */
  steps: {
    clone: StepStatus;
    extract: StepStatus;
    generate: StepStatus;
    review: StepStatus;
    submit: StepStatus;
  };
  /** 关联的文档草稿 */
  draftId?: string;
  /** 关联的 PR 记录 */
  prRecordId?: string;
}

type StepStatus = 
  | { status: "pending" }
  | { status: "running"; startedAt: string }
  | { status: "completed"; completedAt: string }
  | { status: "failed"; error: string; at: string }
  | { status: "skipped" };
```

### DocumentDraft

```typescript
interface DocumentDraft {
  /** 草稿 ID */
  id: string;
  /** 关联的 GenerationRun */
  runId: string;
  /** 原始 README 内容（若存在） */
  originalReadme?: string;
  /** 生成的英文 README */
  generatedReadme: string;
  /** 生成依据的 RepoFacts */
  factsRef: string;  // RepoFacts JSON 文件路径
  /** 内容到证据的映射 */
  contentEvidenceMap: ContentEvidenceMap[];
}

interface ContentEvidenceMap {
  /** 生成文档中的段落/章节 */
  section: string;
  /** 段落内容 */
  content: string;
  /** 该项内容依赖的证据索引（对应 FactsItem.index） */
  evidenceRefs: number[];
  /** 是否有证据支撑 */
  hasEvidence: boolean;
}
```

### PullRequestRecord

```typescript
interface PullRequestRecord {
  /** 记录 ID */
  id: string;
  /** 关联的 GenerationRun */
  runId: string;
  /** PR URL */
  prUrl: string;
  /** 目标仓库 */
  targetRepo: string;
  /** Fork 仓库 URL */
  forkUrl: string;
  /** PR 分支名 */
  branchName: string;
  /** PR 创建时间 */
  createdAt: string;
  /** PR 状态 */
  status: "open" | "closed" | "merged" | "unknown";
  /** 合并时间 */
  mergedAt?: string;
  /** 关闭时间 */
  closedAt?: string;
  /** 最后查询时间 */
  lastCheckedAt: string;
}
```

### 证据设计原则

1. 每项文档中做重要断言的内容（项目用途、技术栈、安装方式、API 入口）必须关联至少一条 Evidence。
2. 通用描述（如"安装 Node.js"）不需要证据。
3. Evidence 的 `lineRange` 和 `symbol` 用于审核报告，不写入最终 README 正文——避免 README 充满失效行号。
4. 最终 README 可通过注释或脚注选择性包含证据引用，但不是强要求。

## 12. 仓库文件筛选策略

### 高价值文件（必读）

| 优先级 | 文件/目录 | 原因 |
|--------|----------|------|
| 1 | `package.json` | 项目名、描述、关键词、脚本、依赖 |
| 2 | `README.md` / `README_zh.md` | 已有文档，了解维护者表述风格 |
| 3 | `tsconfig.json` / `jsconfig.json` | TypeScript 配置、路径别名 |
| 4 | `src/index.ts` 或项目入口文件 | API 导出面、核心入口 |
| 5 | 构建/工具配置（`vite.config.ts`、`next.config.js` 等） | 项目类型识别 |
| 6 | `src/` 目录一级文件列表 | 模块结构概览 |

### 低价值文件（跳过）

- `node_modules/`、`.git/`
- `dist/`、`build/`、`.next/`
- 测试文件（`*.test.ts`、`*.spec.ts`、`__tests__/`）
- `CHANGELOG.md`、`LICENSE`、`.gitignore`
- 图片和二进制文件
- 大于 500KB 的文本文件

### 上下文预算控制

目标：总 Token 不超过 8000（约 2000 行代码），给 AI 生成留足预算。策略：
1. 先读取 `package.json` + `README.md` + 配置文件，估算剩余 Token。
2. 源码文件按优先级读取，每个文件最多取前 300 行（通常足够覆盖导出和核心逻辑）。
3. 若文件数过多，只读模块入口文件（如 `src/index.ts` + `src/*/index.ts`），不递归展开。
4. 超出预算时截断并在 prompt 中注明"以下文件因长度限制仅读取前 N 行"。

## 13. AI 输入输出边界

### 输入边界

AI 接收：
- 仓库元信息（owner、name、defaultBranch、commitSha）
- 筛选后的文件内容（文件路径 + 完整内容）
- 明确的 System Prompt（定义提取格式和约束）

AI 不接收：
- 网络搜索权限
- 任意文件系统访问（只能看到我们传入的文件）
- 执行命令权限（无 Bash/Shell 工具）
- Git 操作权限

### 输出边界

AI 永远只输出结构化 JSON（`FactsItem[]` 或 Markdown 文档），不做以下输出：
- 不输出 Git 命令或脚本建议
- 不输出"请执行 XXX"类行动指令
- 不对代码质量做主观评价
- 不判断"是否值得提交 PR"

调用代码是 AI 输出和 Git 操作之间的唯一桥梁。AI 生成内容后，所有后续决策（是否提交、提交什么）必须经用户确认。

## 14. 证据提取与幻觉控制

### 两层防止幻觉策略

**第一层：Prompt 约束**

AI 事实提取 prompt 强制要求：
- 每个 FactsItem 必须包含从源文件中找到的具体证据（文件名 + 内容片段 + 行号）。
- 若无法从源文件找到证据支撑，标注 `confidence: 0` 或跳过该项。
- 禁止基于包名猜测项目用途——必须从 README、源码注释或配置文件推断。
- 技术栈项必须来自 `package.json` 的 `dependencies`/`devDependencies` 字段，不得编造。

**第二层：Zod 校验**

```typescript
const EvidenceSchema = z.object({
  sourceType: z.enum(["file", "config", "dependency", "export"]),
  filePath: z.string(),
  commitSha: z.string().length(40),
  symbol: z.string().optional(),
  lineRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["static", "ai-inferred"]),
});

const FactsItemSchema = z.object({
  category: z.enum([...]),
  content: z.string().min(10),
  evidence: z.array(EvidenceSchema).min(1),
  combinedConfidence: z.number().min(0).max(1),
});
```

校验失败的处理：
1. 若整体 JSON 解析失败 → 重试一次（带错误提示）。
2. 若单个 Items 校验失败 → 丢弃该校验失败项，保留有效项。
3. 若有效项不足最小阈值（如 3 项）→ 报告提取失败，不进入生成阶段。

### 代码证据来源

| 追求的信息 | 静态提取来源（不依赖 AI） | AI 推断来源 |
|-----------|--------------------------|-----------|
| 项目名 | `package.json` → `name` | README 标题 |
| 项目用途/描述 | `package.json` → `description` | README 简介段落 |
| 技术栈 | `package.json` → `dependencies` | 配置文件检测 |
| 安装方式 | `package.json` → `scripts` | README 安装指令 |
| 使用示例 | — | README + 源码中 export |
| API 面 | 源码 → 解析 export | AI 阅读导出函数签名 |

第一列提取方式标记为 `"static"`（高置信度），第二列标记为 `"ai-inferred"`。

## 15. 文档生成与人工审核

### 生成约束

Prompt 中的红线：
1. 只生成有证据支撑的内容。无证据 = 不生成。
2. 安装指令基于 `package.json` 的 scripts 和 dependencies，不编造未出现的命令。
3. 技术栈描述使用 `package.json` 中的真实包名。
4. 使用示例仅在源码中找到实际 API 调用模式时生成。
5. 不虚构"Contributing Guide"、"Code of Conduct"等内容。
6. 不添加"Star History"、"License Badge"等装饰内容。

### 生成模板

```markdown
# {project_name}

{description}

## Features

{从源码中确认的功能}

## Tech Stack

{从 package.json 提取的技术栈}

## Installation

{从 package.json scripts 和 README 提取的安装步骤}

## Usage

{从源码中确认的使用示例}

## API

{从 export 中确认的 API 面}

## License

{从 LICENSE 或 package.json 提取，若无则不生成}
```

无证据支撑的章节直接省略。

### 审核界面

`prepare` 命令在生成文档后展示审核界面：

1. **Diff 预览**：检测仓库中英文文档命名约定（`README.en.md`、`README_EN.md` 等），若已有英文 README 则显示 `git diff` 风格差异；若尚无英文 README 则显示完整新文档。无论哪种情况，原中文 `README.md` 保持不变。
2. **证据报告**：列出关键断言及其证据来源（文件:行号）。
3. **交互选项**：
   - `[y]` 确认提交为 Draft PR
   - `[n]` 放弃，清理临时文件
   - `[e]` 用 `$EDITOR` 打开文件让用户编辑
   - `[d]` 仅输出文档草稿路径，不做 Git 操作

安全原则：用户在 `[y]` 按下之前，RepoPassport 不执行任何写操作。

## 16. Fork、Commit、Draft PR 流程

### 完整序列

用户确认后按顺序执行，任一步失败→回滚。

```
1. gh repo fork {owner}/{repo} --clone=false --remote=true
   输出: fork-url (git@github.com:{user}/{repo}.git)

2. git remote add repopassport-fork {fork-url}

3. git checkout -b repopassport/en-readme
   (若分支已存在，追加时间戳: repopassport/en-readme-{timestamp})

4. 检测英文文档命名约定：
   → 若仓库已有英文 README（如 README.en.md、README_EN.md 等），遵循现有文件名更新
   → 若仓库尚无英文 README，默认创建 README.en.md
   → 原中文 README.md 始终不变。

5. git add README.en.md

6. git commit -m "docs: add English README"
   (Commit body: AI-assisted, human-reviewed)

7. git push repopassport-fork repopassport/en-readme

8. gh pr create \
     --repo {owner}/{repo} \
     --base {defaultBranch} \
     --head {user}:repopassport/en-readme \
     --title "docs: add English README" \
     --body "## Summary\n\nAI-assisted English README generation. Human-reviewed before submission.\n\n## What Changed\n\n- Added README.en.md (English README)\n- Original Chinese README.md preserved\n\nEvidence extracted from:\n- package.json\n- Source files\n- Existing documentation\n\nGenerated by RepoPassport (MVP)" \
     --draft
```

### 回滚策略

| 失败步骤 | 回滚动作 |
|---------|---------|
| Fork 失败 | 报告错误，清理临时克隆目录 |
| remote add / branch 失败 | `git remote remove repopassport-fork`（若已添加），清理 |
| commit 失败 | `git checkout {originalBranch}`，删除分支，清理 |
| push 失败 | 同上 |
| PR 创建失败 | 可选项：保留 fork 和分支，告知用户手动创建 PR |

所有回滚后删除临时克隆目录。原仓库不受任何影响（只有 shallow clone 到 temp dir）。

## 17. PR 状态记录方式

### 存储位置与格式

```
~/.repopassport/
├── config.json          # 用户配置
├── runs/                # 运行记录
│   └── {runId}.json     # GenerationRun
├── drafts/              # 文档草稿
│   └── {draftId}.json   # DocumentDraft
└── prs/                 # PR 记录
    └── {prRecordId}.json # PullRequestRecord
```

文件命名：`{runId}.json`，其中 runId 为 UUID v4。

### status 命令逻辑

```
repopassport status <pr-url>
→ 从本地 prs/ 目录查找匹配的 PR 记录
→ 调用 gh pr view <pr-url> --json state,mergedAt,closedAt
→ 更新本地记录中的 status、mergedAt、closedAt、lastCheckedAt
→ 输出 JSON
```

不自动轮询、不做 Webhook、不设置 cron。仅用户主动查询时更新。

## 18. 错误处理与安全边界

### 错误处理策略

| 错误类别 | 处理方式 |
|---------|---------|
| 前置条件不满足（gh 未安装、未登录） | 立即终止，输出明确修复指引 |
| 网络错误（克隆失败、API 超时） | 重试 1 次，仍失败则终止并保留错误上下文 |
| AI 调用失败 | 重试 1 次（仅 JSON 解析失败时）；仍失败则终止 |
| Zod 校验失败 | 丢弃无效项，若低于阈值则终止 |
| Git 操作失败 | 按第 16 节回滚策略执行 |
| gh CLI 异常 | 终止并显示原始错误输出 |

### 安全边界

1. **AI 无法控制 Git**：AI 调用和 Git 操作之间永远隔一个用户确认步骤。
2. **只 Fork 不直接 Push 原仓库**：Fork 到用户自己名下，Push 到用户 Fork，PR 手动触达原仓库。
3. **默认 Draft**：`--draft` 确保 PR 不通知所有 Watch 用户，仅维护者可见。
4. **单仓库单 PR**：MVP 无批量处理，削弱滥用感知。
5. **临时目录隔离**：`os.tmpdir()` + 随机子目录，程序退出后清理。
6. **不存储 API Key 明文**：配置文件写 `${ENV_VAR}` 而非实际值，从 `process.env` 读取。
7. **不读取用户私有仓库**：`prepare` 仅接受公开 GitHub URL（`github.com/owner/repo` 形式）。

### 子进程安全

- 所有 `child_process.exec` 调用使用参数数组形式（`execFile` 或 `spawn`），避免 shell 注入。
- 不对用户输入的 URL 做 `eval` 或拼接 shell 命令。

## 19. 测试与真实仓库验收方案

### 测试策略

| 层级 | 工具 | 覆盖内容 |
|------|------|---------|
| 单元测试 | Vitest | Zod Schema 校验逻辑、文件筛选函数、证据报告格式化、JSON 存储读写 |
| 集成测试 | Vitest + 临时 Git 仓库 | git 操作封装、gh 命令参数构造 |
| E2E 验收 | 手动 + 真实仓库 | 完整 prepare 链路（dry-run + 真实提交） |

### 真实仓库验收清单

使用 3-5 个真实公开 JS/TS 仓库完成验收：

| 验收项 | 通过标准 |
|--------|---------|
| 克隆分析 | 正确浅克隆、提取文件清单、识别项目类型 |
| 事实提取 | Zod 校验通过、每项有证据、置信度合理 |
| 文档生成 | 生成克制英文 README、无证据段不生成、无幻觉内容 |
| 审核展示 | 终端显示清晰 Diff 和证据报告、等待用户输入 |
| Dry-run | 不执行任何 Git 操作、不创建远程资源 |
| Fork + PR | Fork 创建成功、分支名正确、PR 标题合规、Draft 状态 |
| 状态查询 | status 命令返回正确 JSON |
| 错误回滚 | 克隆失败、AI 失败、网络中断均不污染本地或远程 |
| 清理 | 临时目录在程序结束后被删除 |

### 推荐验收仓库候选

- https://github.com/colinhacks/zod（TS 库，README 完善，验证差分能力）
- https://github.com/unjs/pathe（TS 工具，README 简略，验证补充能力）
- https://github.com/alibaba/hooks（中文 RN 项目，真实中文缺口场景）
- https://github.com/antfu/utils（TS 工具集，README 简短）
- https://github.com/Tencent/tdesign-vue-next（大厂中文项目，高关注度）

实际验收时根据仓库可访问性调整。

## 20. MVP 完成定义

MVP 完成的硬性标准：

1. 用户可在自己机器上通过 `npm install -g repopassport` 安装。
2. `repopassport prepare <url>` 对至少 3 个公开 JS/TS 仓库完成完整闭环（含 Fork + Draft PR 提交）。
3. 至少 1 个 PR 获得维护者反馈（评论或合并），即使反馈是拒绝。
4. `repopassport status <pr-url>` 可正确查询 PR 状态。
5. 无已知幻觉生成的文档内容（所有断言可追溯到证据）。
6. 源码不超过 15 个 TypeScript 文件。
7. 所有单元测试通过。

MVP 不需要：
- 任何 PR 被合并（那是产品指标，不是 MVP 完成标准）
- 用户量
- 完善文档或落地页

## 21. 分阶段开发任务

### 阶段 0：项目初始化（0.5 天）

- 初始化 npm 包（`package.json`、`tsconfig.json`）
- 安装依赖（commander、openai、zod、vitest）
- ESLint + Prettier 配置

### 阶段 1：核心链路（2 天）

- 实现 CLI 入口 + `prepare` 命令骨架
- 实现仓库克隆 + 文件筛选 + 临时目录管理
- 实现 OpenAI-compatible client 封装
- 实现 RepoFacts 提取 + Zod 校验
- 实现文档生成
- 实现证据报告格式化 + 审核界面

### 阶段 2：Git 集成（1 天）

- 实现 Fork + Branch + Commit + Push 流程
- 实现 `gh pr create --draft`
- 实现回滚策略
- 实现 `status` 命令

### 阶段 3：存储 + 配置（0.5 天）

- 实现本地 JSON 存储
- 实现配置文件读写
- 实现 dry-run 模式

### 阶段 4：测试 + 验收（1.5 天）

- 单元测试
- 集成测试
- 真实仓库 Dry-run 验收
- 真实仓库完整链路验收（含 Fork + Draft PR）

### 阶段 5：收尾（0.5 天）

- README + 基本使用文档
- npm publish 准备

总计估算：5-6 天（单人全职）。

## 22. 后续扩展必须满足的条件

以下任何扩展方向均不能在 MVP 启动。若未来启动，必须满足对应前提条件：

| 扩展方向 | 启动前提 |
|---------|---------|
| 支持 Python/Go/Rust 等语言 | MVP 完成且 JS/TS PR 合并率 > 20% |
| 支持中文仓库已有英文文档的翻译补充 | 至少有 3 个 PR 获维护者正向反馈 |
| Web UI + 后端 | 周活跃用户 > 50 或 CLI 功能集定型 |
| GitHub App + OAuth | 用户强需求（>10 次 request）且愿意授权 |
| 多仓库批量处理 | CodeRabbit Slop Detection 未命中测试通过 |
| 维护者主动安装的持续同步能力（`init` 命令，属 v0.2 规划，非 v0.1） | MVP v0.1 完成且至少 3 位维护者表达使用意愿（详见附录 C） |
| 持续追踪 PR 合并率 | PR 记录积累到 > 20 条统计有效 |
| 自动回复维护者评论 | 人工参与 > 50 次 PR 对话后总结模式 |
| 向量 RAG 增强仓库理解 | Token 预算瓶颈证明简单策略不够（如大型 monorepo 无法处理） |
| 追加其他语种（日、韩等）翻译 | MVP 英文文档场景验证成功后，且已有明确用户需求 |

扩展之前需要执行的实验：
1. 真实仓库采样报告（来自 market-research.md 第 17 节建议）
2. 维护者接受度小样本验证（至少 5 次手工 PR 获得反馈）
3. CodeRabbit Slop Detection 命中测试（在自有测试仓库中故意提交一次低质量 PR 观察标记模式，禁止在公共仓库做此实验）

## 附录 A：与市场调研的一致性与修正

本文档基于 `docs/research/market-research.md` 第二轮调研结论设计：

- 差异化聚焦于证据追溯 + 贡献闭环 + PR 结果 KPI（调研 10.3 节）
- AI 不直接决定 Git 操作，用户审核前置（调研 8.3 节 Slop Detection 启示）
- 单仓库单 PR、Draft 默认态（调研 8.5 节 GitHub 规则约束）
- 不做批量、不做全自动（调研 8.4 节风险对比）

## 附录 B：当前 Git 状态

仓库初始化中，文件结构：

```
.codebuddy/    # Agent 定义和项目配置
docs/
├── research/
│   ├── market-research.md            # 市场调研（第二轮完成）
│   └── research_plan_round2_competitive_audit.md
└── product/
    └── mvp-design.md                 # 本文档
```

无已有代码、无 README、无 package.json。下一步为阶段 0 实现。

## 附录 C：自动文档同步路线图（v0.1.1 → v0.2）

当前 MVP 解决第一次为仓库建立英文文档。后续真正有长期价值的第二形态是自动同步：中文文档和代码继续变化以后，英文文档不会慢慢变成遗迹。

### 两种用户模式

**模式一：外部贡献者（当前 MVP）**

用户发现别人的仓库，为它生成一次英文文档 PR。不可长期监听别人的仓库并不断发 PR，否则极易变成骚扰。

```
手动运行 → 生成 → 审核 → 提交一次 Draft PR
```

**模式二：仓库维护者（v0.2 目标）**

仓库主人觉得 RepoPassport 好用，主动执行 `repopassport init`，工具为仓库生成 CI 配置，之后仓库 Push 事件自动触发文档同步。

```
repopassport init
  → 生成 .repopassport.yml
  → 生成 .github/workflows/repopassport-sync.yml
```

### 自动同步工作流（v0.2）

```text
代码或中文 README 更新（Push to main）
        ↓
GitHub Actions 检测发生变化的文件
        ↓
重新提取受影响的 RepoFacts
        ↓
与上次运行时保存的旧 RepoFacts 对比
        ↓
Facts Diff：判断英文文档是否需要变化
        ↓
没有 Diff → 安静退出
有 Diff → 只重新生成受影响章节 → 创建或更新一个 Draft PR
        ↓
维护者审核后合并
```

### 路径过滤避免循环触发

```yaml
on:
  push:
    branches:
      - main
    paths:
      - "src/**"
      - "tests/**"
      - "package.json"
      - "README.md"        # 原中文文档
      - "README_zh.md"
      - "!README.en.md"    # 排除英文文档，避免循环
      - "!README_EN.md"
```

### 增量更新而非推倒重写

更新流程不应该是"仓库 Push → 把整份英文 README 推倒重写"，而应该比较新旧事实：

```diff
- 启动命令：npm run dev
+ 启动命令：pnpm dev

+ 新增环境变量：DATABASE_URL
+ 新增功能：GitHub OAuth
```

然后只重新生成安装说明、配置说明、新增功能章节。内部形成：

```text
旧 RepoFacts (从上次 PR 记录中恢复)
      ↓ 对比
新 RepoFacts (重新分析当前 HEAD)
      ↓
Facts Diff（新增/修改/删除的事实项）
      ↓
受影响的文档章节（仅重写这些章节）
```

这会让 PR 很小，维护者一眼就能审核。

### 自动但不自动合并

权限建议：

```yaml
permissions:
  contents: write
  pull-requests: write
```

仓库主人可能需要在设置中允许 GitHub Actions 创建 PR（GitHub 默认可能禁止）。[GitHub Actions 仓库设置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

整个流程最多自动到创建或更新 Draft PR。AI 可以敲门，但不能趁主人睡觉自己搬进来。

### 版本路线

| 版本 | 命令 | 功能 |
|------|------|------|
| **v0.1** | `prepare` / `status` | 第一次为仓库生成英文 README，手动审核后 Draft PR |
| **v0.1.1** | `sync <repo-url>` | 重新分析仓库，但只更新已有英文文档发生变化的部分（手动触发） |
| **v0.2** | `init` | 生成 `.github/workflows/repopassport-sync.yml`，仓库主人安装后 Push 事件自动触发文档漂移检测和增量同步 PR |

当前 v0.1 CLI 不是临时玩具。核心分析管线（浅克隆 → 文件筛选 → RepoFacts 提取 → 文档生成）以后可以原封不动地放进 GitHub Actions，只是把"人手动运行"换成"Push 事件触发"。

### v0.1.1 sync 命令预览

```bash
repopassport sync <repo-url>

# 示例
repopassport sync https://github.com/owner/repo --dry-run
```

流程：

```
1. 浅克隆仓库
2. 提取新 RepoFacts
3. 从本地 ~/.repopassport/drafts/ 读取上次生成的英文 README
4. 读取上次保存的旧 RepoFacts
5. 生成 Facts Diff
6. 若 Diff 为空 → 输出 "文档无需更新" 并退出
7. 若 Diff 非空 → 只重新生成受影响的章节
8. 展示 Diff + 证据报告 → 等待用户确认
9. 审核通过 → Fork + Commit + Draft PR
```

### v0.2 init 命令预览

```bash
repopassport init

# 示例
repopassport init --workflow-dir .github/workflows
```

输出文件：

```yaml
# .repopassport.yml
version: "0.2"
repo:
  sourceFiles:
    - "src/**"
    - "package.json"
    - "README.md"
  excludeFiles:
    - "**/*.test.ts"
    - "**/*.spec.ts"
  englishReadme: "README.en.md"
  syncStrategy: "incremental"  # 增量更新，非全量重写
```

```yaml
# .github/workflows/repopassport-sync.yml
name: RepoPassport Sync
on:
  push:
    branches: [main]
    paths:
      - "src/**"
      - "package.json"
      - "README.md"
      - "README_zh.md"
      - "!README.en.md"
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g repopassport
      - run: repopassport sync .
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### v0.1 阶段为同步做准备

v0.1 在文档生成后保存以下数据，为 v0.1.1 Facts Diff 铺垫：

```typescript
// 在 GenerationRun 记录中额外保存
{
  oldFacts: RepoFacts;   // 本次提取的完整事实（下次同步时作为"旧"）
  generatedFiles: string[];  // ["README.en.md"] — 本次生成的文件列表
}
```

不做任何 CI 配置生成、不做 `.repoassport.yml`、不做 GitHub Actions 文件。仅多存一个 JSON 字段，为后续 sync 命令提供对比基线。
