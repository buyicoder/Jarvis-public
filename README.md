# Jarvis — AI 个人秘书系统

> 你不需要学怎么搭知识库。你只需要说话。Jarvis 自动帮你记、帮你搜、帮你整理。

Jarvis 是一个基于 Claude Code 的个人 AI 秘书框架。它把你的日常对话、项目进展、决策、消费记录全部自动归档到分层记忆库，通过混合搜索（语义 + 关键词）随时恢复上下文。让你和 AI 的协作不再"每次从零开始"。

**它不是"教你搭 RAG"的教程——它是已经搭好的 RAG。clone 下来就能用。**


## 为什么是 Jarvis

| 你想要的 | 传统做法 | Jarvis |
|----------|----------|--------|
| 记住每次和 AI 聊了什么 | 手动写文档、复制粘贴 | Stop Hook 自动记录，每天一个 .md |
| 下次提到同一个项目能恢复上下文 | 翻聊天记录、翻 Git log | 向量 + 关键词混合搜索，秒出 |
| 提取可复用的踩坑经验 | 写在某个文件夹里，永远找不到 | patterns/ 目录，自动向量化，下次自动检索 |
| 积累工具清单 | 散落在脑子/浏览器收藏夹 | toolbox/_index.md，启动时自动加载 |
| 了解自己的行为模式 | 凭感觉 | 12 步扫描流程，从 GitHub/浏览器/消费/AI历史中还原人格画像 |


## 核心能力

### 🧠 分层记忆架构

```
memory/
├── core/              ← 🟢 永久层：身份、项目、决策、工具箱（永不过期）
├── daily/             ← 🟡 热层：最近 90 天日志（启动时加载最近 3 天）
├── archive/           ← 🔵 温层：90 天前的日志（仅按需搜索）
├── conversations/     ← 外部沟通记录
├── scans/             ← 🔴 临时层：系统扫描报告（30 天后过期）
├── financial/         ← 消费记录
└── _schemas/          ← 模板与参考手册
```

启动时只加载核心摘要（~2,500 tokens），更早的内容通过搜索按需检索——90%+ 的 token 节省。

### 🔍 混合搜索引擎

不是单一的向量搜索。是**三层融合**：

```
查询 "modfactory 渲染 bug"
        │
        ├──→ 语义搜索（bge-small-zh-v1.5 512维）
        ├──→ 关键词搜索（BM25 全文索引）
        │
        └──→ Reciprocal Rank Fusion 融合排名
              │
              ├──→ 时间衰减（30天内×1, 90天×0.8, 更早×0.5）
              └──→ 重要性加权（high×1.2, low×0.8）
```

对比纯向量搜索，混合搜索在精确词（项目名、人名、地名）上的命中率显著更高。对比 LangChain 默认搜索，多了时间衰减和重要性加权——不需要写 Retriever 子类。

### 🪝 自动会话捕获

Claude Code Stop Hook 每次会话结束时自动触发：
1. 收集会话上下文（项目路径、修改文件列表、时间戳）
2. 写入 `memory/daily/YYYY-MM-DD.md`
3. 自动运行 `node scripts/index-daily.mjs` 向量化

你不需要手动记录任何东西。

### 🌱 自我进化

接到任务时**先预研**（GitHub API 搜索相关工具 → 检查工具箱 → 安装集成），任务后**自动提取经验模式**写入 `patterns/`，新工具更新 `toolbox/_index.md`。下次遇到类似问题，这些经验会被自动检索出来。

### ⏰ 定时提醒

```
每天 23:30 → "🌙 十二点了。合上电脑。"
每天 07:33 → "☀️ 早上好。几点睡的？今天最想做什么？"
```


## 快速开始

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install

# 初始化：扫描 GitHub 项目 + 构建向量库（首次运行需下载 91MB 嵌入模型）
node scripts/bootstrap.mjs

# 日常索引
node scripts/index-daily.mjs

# 语义搜索
node scripts/query.mjs "Minecraft mod 开发"
```

### 配置

1. 编辑 `.claude/settings.json`，填入你的 API key
2. 创建 `memory/core/identity.md`，写入基本信息
3. 可选：编辑 `memory/core/values.md`、`decisions.md`、`relationships.md`
4. 运行 `node scripts/bootstrap.mjs` 扫描 GitHub 项目
5. 打开 Claude Code 即可使用


## 入职流程：从零到了解你

首次使用建议按 12 步流程让 Jarvis 了解你（详见 `memory/_schemas/jarvis-onboarding-handbook.md`）：

| 层级 | 步骤 | 时间 | 产出 |
|------|------|------|------|
| 🔴 自动 | GitHub 项目扫描 | 5 min | 项目摘要 + 分类索引 |
| | 系统扫描（软件/目录/下载） | 3 min | 工具链 + 活跃项目 |
| | 浏览器历史 + 搜索词 | 8 min | 信息源 + 时间线 |
| | Git 提交历史 | 5 min | 工作节奏 |
| | 消费记录分析 | 3 min | 真实投入结构 |
| 🟡 工具 | AI 对话导出（豆包等） | 15 min | 451 万字深度画像 |
| 🟠 人工 | 日记深度阅读 + 直接询问 | 50 min | 价值观/决策/关系 |

完成后面，Jarvis 就不仅仅是秘书——它能理解你是谁。


## 架构全景

```
┌──────────────────────────────────────────────┐
│                CLAUDE.md                     │
│  启动时加载 toolbox + 最近3天 daily + 项目索引  │
├──────────────────────────────────────────────┤
│                  采集层                       │
│  Stop Hook · Playwright导出 · GitHub API      │
│  系统扫描 · 浏览器历史 · 消费记录CSV          │
├──────────────────────────────────────────────┤
│                  存储层                       │
│  memory/core/ · daily/ · archive/ · scans/   │
│  (markdown + frontmatter)                    │
├──────────────────────────────────────────────┤
│                  索引层                       │
│  bge-small-zh-v1.5 (512维) + BM25 + RRF融合  │
│  LanceDB · 时间衰减 · 重要性加权              │
├──────────────────────────────────────────────┤
│                  进化层                       │
│  patterns/ · toolbox/ · skills/registry     │
│  预研 → 执行 → 提取 → 索引 闭环              │
└──────────────────────────────────────────────┘
```

### 代码规模

| 模块 | 行数 | 职责 |
|------|------|------|
| `embedding.mjs` | 45 | 本地模型加载 + 嵌入 |
| `vector-store.mjs` | 170 | 向量写入 + 混合搜索 + 时间衰减 |
| `knowledge-base.mjs` | 130 | Markdown 读写 + 分块 |
| `github-client.mjs` | 100 | GitHub API + 项目分类 |
| `bootstrap.mjs` | 180 | 项目扫描 → 摘要 → 向量化 |
| `index-daily.mjs` | 130 | 增量索引 + 词表自动扩展 + 健康监控 |
| **总计** | **755 行** | 完整 RAG 管道 |

对比 LangChain 同等功能：80 行配置 + 8 层继承 + 20+ 依赖。


## 技术栈

| 组件 | 选择 | 原因 |
|------|------|------|
| 嵌入模型 | bge-small-zh-v1.5 (512维, 91MB) | 中文原生优化，本地 ONNX，零 API 费用 |
| 向量库 | LanceDB | 嵌入式，零运维，Node.js 原生 |
| 全文检索 | BM25 (LanceDB FTS) | 精确词匹配，互补语义搜索 |
| 融合算法 | Reciprocal Rank Fusion | 向量 + 关键词排名融合 |
| Markdown | gray-matter | frontmatter 解析 |
| 浏览器自动化 | Playwright + Edge CDP | 导出 AI 对话记录 |
| AI 后端 | DeepSeek V4（可替换） | OpenAI 兼容 API |

**依赖总数：4 个**（@huggingface/transformers, @lancedb/lancedb, gray-matter, playwright）

## 目录结构

```
Jarvis-public/
├── CLAUDE.md                         ← 秘书人格（模板）
├── .claude/
│   ├── settings.json                 ← Claude Code 配置（填入你的 key）
│   └── hooks/stop.js                 ← 自动会话捕获
├── scripts/
│   ├── lib/
│   │   ├── config.mjs                ← 路径/配置
│   │   ├── embedding.mjs             ← bge-small-zh 本地嵌入
│   │   ├── vector-store.mjs          ← 混合搜索 + 时间衰减
│   │   ├── knowledge-base.mjs        ← Markdown 读写 + 分块
│   │   └── github-client.mjs         ← GitHub API
│   ├── bootstrap.mjs                 ← 初始化项目索引
│   ├── index-daily.mjs               ← 每日增量索引 + 健康监控
│   ├── query.mjs                     ← 命令行搜索
│   ├── reindex.mjs                   ← 全量重建（含模型下载）
│   ├── download-model.mjs            ← 通过代理下载嵌入模型
│   ├── export-doubao.mjs             ← Playwright 导出豆包对话
│   └── summarize-doubao.mjs          ← 对话统计分析
├── memory/
│   ├── core/                         ← 永久层（identity/values/decisions/relationships/projects/toolbox/patterns）
│   ├── daily/                        ← 热层（YYYY/MM/YYYY-MM-DD.md）
│   ├── archive/                      ← 温层
│   ├── _schemas/                     ← 模板 + 参考手册
│   └── skills/                       ← 技能注册表
└── index/
    ├── models/                       ← 嵌入模型（本地，需要时下载）
    └── vector/                       ← LanceDB 向量库
```

## 许可

MIT
