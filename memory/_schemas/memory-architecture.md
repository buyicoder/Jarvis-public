---
name: memory-architecture
type: system_design
date: 2026-06-20
tags: [Jarvis, 存储, 架构, 记忆系统]
---

# Jarvis 记忆存储架构

> 设计目标：高效存储和检索个人日常生活、工作、学习的全部记忆。

---

## 一、当前问题

| 问题 | 表现 |
|------|------|
| 平面结构 | 所有文件平铺在 `knowledge-base/` 下，无层级 |
| 向量退化 | TF-IDF 词表固定 512 维，新词汇永远搜不到 |
| 无时间衰减 | 一年前的日记和昨天的日记搜索权重相同 |
| 无关联链接 | 日记提到"modfactory"但不会自动关联项目文件 |
| 无生命周期 | 临时数据（扫描报告）和永久数据（个人档案）同等对待 |
| 无增量设计 | 每天新增数据后需要手动运行 index-daily |

---

## 二、目标架构

```
Jarvis/
├── memory/                           ← 新：统一记忆存储
│   ├── core/                         ← 🟢 永久层：身份、价值观、关键决策
│   │   ├── identity.md               ← 我是谁
│   │   ├── values.md                 ← 我相信什么
│   │   ├── decisions.md              ← 关键决策日志
│   │   └── relationships.md          ← 重要人际关系
│   │
│   ├── daily/                        ← 🟡 热层：最近 90 天的每日记录
│   │   └── YYYY/MM/YYYY-MM-DD.md
│   │
│   ├── archive/                      ← 🔵 温层：90 天前的每日记录
│   │   └── YYYY/MM/YYYY-MM-DD.md
│   │
│   ├── projects/                     ← 🟢 永久层：项目摘要
│   │   ├── _index.md                 ← 分类索引
│   │   └── <project-name>.md
│   │
│   ├── conversations/                ← 🟡 热层：最近 30 天的外部沟通
│   │   └── YYYY-MM-DD-人物-主题.md
│   │
│   ├── scans/                        ← 🔴 临时层：系统扫描报告
│   │   ├── computer-scan-2026-06-20.md
│   │   └── browser-history-2026-06-20.md
│   │
│   ├── financial/                    ← 🟡 热层：消费记录
│   │   └── YYYY-MM.md
│   │
│   └── _schemas/                     ← 模板定义
│       ├── daily-template.md
│       ├── project-template.md
│       └── conversation-template.md
│
├── index/                            ← 新：多维度索引
│   ├── vector/                       ← LanceDB 向量索引
│   ├── fulltext/                     ← 全文搜索索引（可选，Minisearch）
│   └── graph/                        ← 关联图谱（可选，JSON 文件）
│
├── ingest/                           ← 新：数据摄入管道
│   ├── hooks/                        ← Claude Code hooks
│   ├── cron/                         ← 定时任务
│   └── manual/                       ← 手动导入脚本
│
└── scripts/                          ← 工具脚本（现有）
```

---

## 三、存储分层——按访问频率和时效性

### 🟢 永久层（Core）——永不过期，始终加载

| 文件 | 大小预估 | 更新频率 | 检索权重 |
|------|----------|----------|----------|
| identity.md | 5-10 KB | 每月 | 最高 |
| values.md | 2-5 KB | 每季度 | 最高 |
| decisions.md | 20-50 KB | 每周追加 | 高 |
| relationships.md | 10-20 KB | 每月 | 高 |
| projects/_index.md | 10-20 KB | 每周重建 | 高 |
| projects/<name>.md | 2-5 KB × N | 每周更新 | 高 |

**检索策略**：始终在上下文窗口中。启动时自动加载 `_index` 摘要，按需读取完整文件。

### 🟡 热层（Hot）——最近 90 天，高频访问

| 目录 | 日均新增 | 90天总量 | 检索策略 |
|------|----------|----------|----------|
| daily/ | 1 个文件，2-5 KB | 90 个文件，~300 KB | 按日期 + 向量搜索 |
| conversations/ | 0-3 个文件，2-5 KB | ~100 个文件，~300 KB | 按人物 + 日期 + 向量搜索 |
| financial/ | 1 个月度文件 | 3 个文件 | 按日期 |

**检索策略**：最近 3 天自动加载。更早的按需向量搜索。

### 🔵 温层（Archive）——90 天以上，低频访问

**检索策略**：仅通过向量搜索按需加载。不自动加入上下文。

### 🔴 临时层（Scans）——一次性报告，限定有效期

| 文件 | 保留策略 | 原因 |
|------|----------|------|
| 系统扫描报告 | 30 天后归档或删除 | 信息快速过时 |
| 浏览器历史分析 | 30 天 | 浏览模式持续更新 |
| 导出类文件 | 原数据保存，分析报告保留 | 数据比分析长久 |

---

## 四、索引策略——三个维度同时索引

### 1. 向量索引（语义搜索）

当前：TF-IDF 512 维，基于 48 个项目的 README 构建。

**缺陷**：新词汇不进词表。下次说"苏瑾"，向量是零向量。

**改进方案**：

| 方案 | 延迟 | 中文效果 | 部署难度 |
|------|------|----------|----------|
| `node-llama-cpp` + GGUF 小模型 | ~100ms | 🟢 好 | 🟡 需下载模型文件 |
| `@xenova/transformers`（修好 sharp） | ~50ms | 🟡 中 | 🟡 编译问题 |
| OpenAI text-embedding-3-small API | ~200ms | 🟢 好 | 🟢 简单，但需 API key |
| DeepSeek v3 embedding（如果有） | ~100ms | 🟢 最好 | 🟢 复用现有 key |

**推荐路径**：先用 `node-llama-cpp` + `bge-small-zh` GGUF 模型（中文优化，24MB，纯 CPU），在 bootstrap 时下载。如果不行退到 OpenAI API。

### 2. 时间索引（按日期检索）

**实现**：文件系统目录结构本身就是时间索引。`daily/YYYY/MM/YYYY-MM-DD.md`。

**增强**：维护一个 `daily/_timeline.json` 文件，每行一个日期 + 摘要（50 字）。启动时读取，无需遍历目录。

```json
[
  {"date": "2026-06-20", "summary": "搭建 Jarvis，扫描系统，导出豆包对话", "projects": ["Jarvis"], "mood": "高效"},
  {"date": "2026-06-19", "summary": "招投标审标系统测试，竞品研究", "projects": ["招投标"], "mood": "一般"}
]
```

### 3. 关联索引（实体链接）

**实现**：在 markdown frontmatter 中维护双向链接。

```markdown
---
date: 2026-06-20
projects: [Jarvis, modfactory]
people: [堂姐老板, 张三]
decisions: [是否合作]
tags: [AI秘书, 系统搭建]
links: [[about-me]] [[memory-architecture]]
---
```

`index-daily.mjs` 在索引时自动提取 frontmatter 中的 `links`，构建关联图。

---

## 五、数据生命周期

### 每日流入

```
Stop Hook → daily/YYYY-MM-DD.md    ← 自动（骨架）
晚间总结 → daily/YYYY-MM-DD.md     ← 手动（语义补全）
消费记录 → financial/YYYY-MM.csv   ← 月度导入
外部沟通 → conversations/          ← 手动
```

### 每日处理（index-daily.mjs 自动执行）

```
1. 读取今天 daily 文件
2. 分块 → embedding → 向量库 upsert
3. 更新 daily/_timeline.json
4. 如果 frontmatter 有 links，更新关联图
5. 检查热层总量，超过阈值则归档
```

### 周期性归档（Cron 周任务）

```
每周日：
  - daily/ 中超过 90 天的文件 → archive/daily/
  - conversations/ 中超过 30 天的 → archive/conversations/
  - 重建 projects/_index.md
```

### 清理策略

| 数据类型 | 保留期 | 到期操作 |
|----------|--------|----------|
| 日记 | 永久 | 90天热层 → 温层归档 |
| 对话 | 永久 | 30天热层 → 温层归档 |
| 系统扫描 | 30 天 | 删除或手动保留 |
| 导出文件 | 永久 | 原数据保留，分析可删 |
| 向量 chunk | 永久 | upsert 覆盖旧版本 |
| timeline.json | 永久 | 仅追加，不删除 |

---

## 六、检索优先级——Jarvis 启动时加载什么

不是加载全部。是分层加载。

```
启动时（~2,500 tokens）:
  1. CLAUDE.md 指令
  2. core/identity.md 摘要（200 字）
  3. daily/_timeline.json 最近 7 天摘要
  4. projects/_index.md 摘要

用户提问时（按需，~1,000-3,000 tokens）:
  5. 向量搜索返回 top-5 chunks
  6. 相关 project 文件的"下次切入要点"段
  7. 相关 daily 文件的"明日计划"段

深度分析时（全量，~5,000-10,000 tokens）:
  8. 最近 3 天 daily 全文
  9. 相关 conversations 全文
  10. core/ 中的相关文件
```

---

## 七、实施路线

| 阶段 | 内容 | 耗时 |
|------|------|------|
| Phase 1（本周） | 重构为 `memory/` 目录结构，迁移现有文件 | 30 min |
| Phase 1 | 添加 `_timeline.json` 维护逻辑到 index-daily | 20 min |
| Phase 1 | 添加周期性归档逻辑到 index-daily | 20 min |
| Phase 2（下周） | 替换 TF-IDF 为真正的 embedding | 1-2 h |
| Phase 2 | 添加 frontmatter links 自动关联 | 30 min |
| Phase 3（以后） | Minisearch 全文索引 | 1 h |
| Phase 3 | 关联图谱可视化 | 2 h |

---

## 八、设计原则

1. **Markdown 是真理源。** 所有数据最终落地为人类可读的 markdown。向量和索引都是从 markdown 派生的。

2. **文件系统是索引。** `YYYY/MM/DD.md` 的目录结构本身比任何数据库都快。

3. **热数据在内存，温数据在磁盘，冷数据在归档。** 启动时只加载热层摘要。

4. **隐私分层。** `core/` 和 `conversations/` 有独立的访问控制意识。将来如果需要多用户，可以按目录设权限。

5. **不存储原始聊天记录。** 豆包导出的 JSON 是分析产物，不是记忆。从对话中提取的结构化信息（决策、关系、偏好）进入 core/，原始对话不长期保留。
