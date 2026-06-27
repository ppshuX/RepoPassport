# 第二轮补强调研计划（红队视角）

## 目标
以"试图推翻当前结论"的角度，重新核验所有竞品，更新 market-research.md。

## 查询类型：Breadth-first + Depth-first 混合
- 10+ 产品各自独立核验（广度）
- 每个产品深入 8 项能力检查（深度）

## 产品分组与子代理分配

### Agent A：AI 文档生成类产品
- ReadmeAI (github.com/eli64s/readme-ai)
- readmeX (github.com/aibox22/readmeX)
- DeepWiki

### Agent B：GitHub 生态与 PR 自动化类
- CodeRabbit（含 Agent、Knowledge Base、Slop Detection）
- PR-Agent / Qodo
- GitHub Copilot Coding Agent / Cloud Agent

### Agent C：文档平台与知识基础设施类
- Mintlify
- Swimm
- Crowdin
- GitLocalize

## 搜索策略
1. 优先官网、官方文档、官方 GitHub 仓库
2. 微信文章搜索补充中文生态视角
3. 每个产品核验 8 项能力矩阵

## 新增章节
- RepoPassport 与 ReadmeAI 详细差异
- RepoPassport 与通用 Coding Agent 边界
- AI Slop Detection 启示
- GitHub API/权限/频率限制/反滥用约束
- 两种模式风险对比（仓库主人主动使用 vs 外部贡献者发起 PR）
- 差异化覆盖状态评估

## 输出
- 更新后的 market-research.md（在原文件基础上修改）
- 结论评估标记（已验证/部分验证/尚未验证/被反例推翻）
