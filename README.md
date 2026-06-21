# Jarvis — AI 个人秘书系统

> 一个基于 Claude Code 的个人 AI 秘书框架。多层记忆架构、语义搜索、自动会话捕获、自我进化。

Jarvis 帮助你建立**外部认知系统**——把你每天的工作、学习、沟通、决策自动归档，通过向量搜索随时恢复上下文，让你和 AI 的协作不再"每次从零开始"。

## 核心能力

- **分层记忆**：永久层（身份/项目/决策）+ 热层（90天日志）+ 温层（归档）
- **语义搜索**：bge-small-zh-v1.5 中文 embedding 模型，本地运行，零 API 费用
- **自动捕获**：Stop Hook 自动记录每次 Claude Code 会话
- **自我进化**：从每次任务中提取经验模式，工具箱自动增长
- **定时提醒**：Cron 任务（睡觉提醒、早起问安等）
- **数据导出**：Playwright 自动化导出豆包/其他 AI 对话记录

## 快速开始

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install

# 初始化：扫描 GitHub 项目 + 构建知识库
node scripts/bootstrap.mjs

# 日常：索引今天的日志
node scripts/index-daily.mjs

# 搜索记忆
node scripts/query.mjs "Minecraft mod 开发"
```

## 配置

1. 编辑 `.claude/settings.json`，填入你的 API key
2. 创建 `memory/core/identity.md` 写入你的基本信息
3. 打开 Claude Code：`claude`

## 入职流程

首次使用建议按 12 步流程初始化对你的了解：
1. GitHub 项目扫描 → 2. 系统扫描 → 3. 浏览器历史 → 4. 搜索关键词 → 5. Git 提交历史 → 6. 消费记录 → 7. AI 对话导出 → 8-12. 深度分析

详见 `memory/_schemas/jarvis-onboarding-handbook.md`

## 架构

```
memory/         ← 分层记忆存储
  core/         ← 永久层
  daily/        ← 热层（90天）
  archive/      ← 温层
  _schemas/     ← 模板
index/vector/   ← LanceDB 向量库
scripts/        ← 工具脚本
.claude/hooks/  ← 自动捕获
```

## 技术栈

- 嵌入：bge-small-zh-v1.5 (512维，91MB，本地 ONNX)
- 向量库：LanceDB
- Markdown 解析：gray-matter
- 浏览器自动化：Playwright
- 后端模型：DeepSeek V4（可替换任意 OpenAI 兼容 API）

## 许可

MIT
