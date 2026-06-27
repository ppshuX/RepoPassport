# RepoPassport 真实 E2E 检查清单

**重要警告**: 本文档中的所有操作涉及真实的远程 Git 仓库（Fork + Draft PR）。执行前请确保已备份目标仓库，并在受控环境中操作。未经用户亲自确认，不得向任何真实仓库提交 PR。

---

## 一、选择受控测试仓库

### 要求

- 选择一个你拥有 Fork 权限的仓库（建议用自己的小项目）
- 仓库应有中文 README.md，无 README.en.md
- 仓库最好小于 10MB（加速克隆）
- 包含 package.json 或其他元数据文件，便于 AI 提取事实

### 建议

```
# 示例：用你自己的测试仓库
https://github.com/YOUR_USERNAME/test-repo
https://gitee.com/YOUR_USERNAME/test-repo
```

### 不推荐

- 大型仓库（如 linux、kubernetes）
- 他人的重要开源项目（除非已与维护者沟通）
- 包含敏感信息的私有仓库

---

## 二、配置低成本 OpenAI-compatible 模型

### 方式 A：使用真正的 OpenAI（成本极低）

```bash
# Linux/macOS
export OPENAI_API_KEY="sk-..."
# 使用 gpt-4o-mini（~$0.15/1M input tokens，~$0.60/1M output tokens）

# Windows PowerShell
$env:OPENAI_API_KEY="sk-..."
```

### 方式 B：使用兼容 API（如 DeepSeek、OpenRouter）

```bash
# 设置 base URL 和 key
export OPENAI_API_KEY="your-key"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
```

然后指定模型：
```bash
repopassport prepare <repo-url> --provider openai --model deepseek-chat
```

### 方式 C：Mock Provider（零成本，仅结构验证）

```bash
repopassport prepare <repo-url> --provider mock
```
Mock Provider 返回预设内容，不发起任何 API 请求，适合验证代码流程。

---

## 三、执行真实模型 Dry-run

### Step 1：构建项目

```bash
npm run build
```

### Step 2：执行 Dry-run（默认模式）

```bash
# GitHub
node dist/index.js prepare https://github.com/YOUR_USERNAME/test-repo --provider openai --model gpt-4o-mini --verbose

# Gitee
$env:GITEE_TOKEN="your_token"
node dist/index.js prepare https://gitee.com/YOUR_USERNAME/test-repo --provider openai --model gpt-4o-mini --verbose
```

### Step 3：验证输出

你应该看到：
1. 平台检测信息（GitHub / Gitee）
2. 仓库克隆进度
3. 文件采集数量
4. AI 生成的英文 README Diff 预览
5. 证据报告（每个章节标注证据来源）
6. 模式标记 `Dry-run (仅预览，无 Git 写操作)`
7. 交互选项 [y/n/d]

---

## 四、人工核对 RepoFacts 与 Evidence

### 查看草稿

草稿保存在 `~/.repopassport/drafts/<runId>/`，包含：
- `README.en.md` — 生成的英文 README
- `facts.json` — AI 提取的事实清单
- `evidence.json` — 每个章节与事实的证据映射

### 核对清单

| 检查项 | 方法 |
|--------|------|
| 项目名称是否正确 | 对比 package.json / README.md |
| 技术栈是否准确 | 检查 facts 中的 tech 类别 |
| 安装说明是否可执行 | 阅读并判断命令是否合理 |
| 每个声明是否有证据 | evidence.json 中 hasEvidence 字段 |
| 无证据章节是否被过滤 | 最终 README 不应出现无证据 H2 |
| 中文 README 未被覆盖 | 确认只有 README.en.md 被创建 |

### 发现问题时

- 在 `[d]` 选项中保存草稿，手动修改 README.en.md
- 或用 `[n]` 放弃，调整代码后重新生成

---

## 五、如何检查 README.en.md

### 质量维度

```
1. 结构完整性：是否有 Overview、Install、Usage、API 等必要章节
2. 语言质量：英文是否自然，无 Chinglish
3. 事实准确性：技术栈、安装命令、API 用法是否与源码一致
4. 证据覆盖率：hasEvidence 为 false 的章节数
5. 代码块正确性：\`\`\` 是否闭合，语法是否正确
```

### 手动修正

将草稿复制到目标仓库并手动 review：
```bash
cp ~/.repopassport/drafts/<runId>/README.en.md ./README.en.md
# 用编辑器 review 和修改
```

---

## 六、执行首次受控 Draft PR（谨慎！）

### 前置条件

1. 已通过 Dry-run 验证，内容满意
2. GitHub: `gh CLI` 已安装并登录 (`gh auth login`)
3. Gitee: 已设置 `GITEE_TOKEN` 环境变量
4. 确认目标仓库是你拥有 Fork 权限的仓库

### Step 1：展示提交信息（--submit 会自动展示）

```bash
node dist/index.js prepare https://github.com/YOUR_USERNAME/test-repo --submit --provider openai --model gpt-4o-mini
```

系统会展示：
- 目标仓库
- Base 分支
- Fork 仓库
- 新分支名称
- 将修改的文件
- PR 标题
- 是否为 Draft

### Step 2：输入确认文本

```
SUBMIT YOUR_USERNAME/test-repo
```

**注意**: 必须输入完整的 `SUBMIT owner/repository`，输入 `y` 或任何其他内容不会创建 PR。

### Step 3：观察执行过程

```
── Fork 仓库 ──
── 添加 Fork Remote ──
── 创建分支 ──
── Stage 文件 ──
── Commit ──
── Push 到 Fork ──
── 创建 Draft PR ──
✅ Draft PR 已创建: https://github.com/YOUR_USERNAME/test-repo/pull/1
```

---

## 七、验证 status 命令

```bash
# 查看 PR 状态
node dist/index.js status https://github.com/YOUR_USERNAME/test-repo/pull/1 --verbose

# 预期输出
PR URL:   https://github.com/YOUR_USERNAME/test-repo/pull/1
Status:   OPEN
Draft:    yes
Created:  <timestamp>
```

---

## 八、清理测试资源

### 清理 GitHub

```bash
# 1. 关闭 / 删除 Draft PR
gh pr close <PR_NUMBER> --repo YOUR_USERNAME/test-repo --delete-branch

# 2. 删除 Fork（在 Fork 仓库目录中）
gh repo delete YOUR_USERNAME/test-repo --confirm
```

### 清理 Gitee

在 Gitee 网页端：
1. 设置 → 仓库管理 → 删除仓库
2. 或通过 API: `curl -X DELETE "https://gitee.com/api/v5/repos/YOUR_USERNAME/test-repo?access_token=$GITEE_TOKEN"`

### 清理本地记录

```bash
rm -rf ~/.repopassport/drafts/<runId>/
# PR 记录在 ~/.repopassport/prs/，按需清理
```

---

## 九、失败时的恢复

### 场景 A：Fork 成功，后续步骤失败

```
✅ Fork 已创建: https://github.com/YOUR_USERNAME/test-repo
❌ Push 失败: authentication error
```

恢复方法：
- Fork 仓库已创建，可以直接在 Fork 的 Web 界面手动操作
- 或使用 gh CLI 手动完成：`gh pr create --repo owner/repo --base main --head YOU:branch --title "..." --draft`

### 场景 B：Push 成功，PR 创建失败

```
✅ Push 已完成
❌ PR 创建失败: rate limit exceeded
```

恢复方法：
- 分支已在 Fork 中，用 gh CLI 手动创建 PR：
  ```bash
  gh pr create --repo owner/repo --base main --head YOU:repopassport/en-readme --title "docs: add English README" --draft
  ```

### 场景 C：PR 创建成功，记录保存失败

恢复方法：
- PR 已存在，平台会保留，影响仅限本地记录
- 可用 `status` 命令查看状态

### 场景 D：重试不创建重复资源

系统检测到已存在的 Fork 或分支名时：
- `createBranch` 会自动追加时间戳避免冲突
- 如已存在相同标题的 Draft PR，GitHub/Gitee 允许创建多个

### 手动清理命令

```bash
# 删除本地分支（在测试仓库目录）
git checkout main
git branch -D repopassport/en-readme

# 删除 Fork remote（在测试仓库目录）
git remote remove repopassport-fork
```

---

## 十、检查清单摘要

| # | 阶段 | 状态 |
|---|------|------|
| 1 | 选择受控测试仓库 | [ ] |
| 2 | 配置 AI Provider | [ ] |
| 3 | 执行 Mock Dry-run | [ ] |
| 4 | 执行真实模型 Dry-run | [ ] |
| 5 | 核对 RepoFacts 与 Evidence | [ ] |
| 6 | 检查 README.en.md 质量 | [ ] |
| 7 | 执行首次 --submit（输入 SUBMIT 确认文本） | [ ] |
| 8 | 验证 status 命令 | [ ] |
| 9 | 清理测试资源 | [ ] |
| 10 | 确认无残留 Fork/PR | [ ] |
