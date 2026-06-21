---
name: jarvis-self-evolution
type: system_design
date: 2026-06-21
tags: [Jarvis, 自我进化, 经验学习, 能力扩展]
---

# Jarvis 自我进化架构

> 让 Jarvis 在执行任务前主动搜索 GitHub 获取能力提升，在任务后自动总结经验沉淀为知识库。

## 一、进化闭环

```
┌─────────────────────────────────────────────────────┐
│                  任务触发                            │
│         用户说"帮我做 X"                              │
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│  Phase 0: 能力预研（新增）                           │
│  ├── GitHub 搜索 X 相关的 skill/工具/项目             │
│  ├── 评估可用性（安装成本 vs 收益）                   │
│  ├── 如果找到 → 安装/集成 → 扩充自身能力              │
│  └── 记录到 skills/registry.json                    │
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│  Phase 1: 执行任务                                   │
│  ├── 使用现有能力 + 新获取的能力                      │
│  ├── 记录过程中的决策点、踩坑、解决方案               │
│  └── 写入 memory/daily/ 开发日志                     │
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│  Phase 2: 经验提取（新增）                           │
│  ├── 从本次任务中提取可复用模式                      │
│  ├── 判断：是一次性知识还是可泛化经验？               │
│  ├── 可泛化 → 写入 memory/core/patterns/            │
│  └── 工具类 → 写入 memory/core/toolbox/             │
└────────────────────┬────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────┐
│  Phase 3: 索引 & 未来检索                            │
│  ├── 新知识自动向量化                                │
│  ├── 下次遇到类似任务时自动检索                      │
│  └── 启动时加载最近的能力更新                        │
└─────────────────────────────────────────────────────┘
```

## 二、新增目录结构

```
memory/
├── core/
│   ├── patterns/                    ← 🆕 可复用模式
│   │   ├── ascii-art-design.md      ← 今天学到的：FIGlet 字体选择、ANSI Shadow
│   │   ├── cookie-decryption.md     ← 昨天学到的：ABE 无法破解，用 Playwright
│   │   ├── doubao-export.md         ← 昨天学到的：无限滚动 + DOM 抓取
│   │   └── embedding-upgrade.md     ← 昨天学到的：TF-IDF → bge-small-zh
│   │
│   └── toolbox/                     ← 🆕 工具注册表
│       ├── _index.md                ← 所有已知工具的索引
│       ├── figlet.md                ← FIGlet CLI + 推荐字体
│       ├── playwright.md            ← 浏览器自动化方案
│       ├── lancedb.md               ← 向量库方案
│       └── taste-skill.md           ← 前端品味注入
│
├── skills/                           ← 🆕 外部技能的本地镜像
│   ├── registry.json                ← 已安装/已评估的技能清单
│   └── taste-skill/                 ← 已获取的技能
│
└── _schemas/
    └── pattern-template.md           ← 🆕 经验模式模板
```

## 三、核心脚本

### `scripts/research.mjs` — 能力预研（新增）

```
输入：任务描述
流程：
  1. 从任务描述中提取关键词
  2. GitHub API 搜索 "claude skill <关键词>" + "<关键词> cli tool"
  3. 过滤：stars > 5, updated within 6 months
  4. 评估：能否安装？能否集成？收益多大？
  5. 输出：推荐列表 + 安装命令

输出：
  - 控制台：找到 N 个相关工具
  - 文件：memory/skills/research-YYYY-MM-DD.json
```

### `scripts/extract-pattern.mjs` — 经验提取（新增）

```
输入：当天的 daily 文件
流程：
  1. 读取今天 daily 的开发段落
  2. 识别模式标记：
     - "踩坑" / "失败" → 坑模式
     - "解决方案" / "改用" → 方案模式
     - "安装" / "配置" → 工具模式
  3. 生成 pattern markdown 文件
  4. 自动写入 memory/core/patterns/
  5. 自动向量化
```

### `scripts/toolbox-scan.mjs` — 工具盘点（新增）

```
流程：
  1. 扫描 ~/.claude/skills/ 下已安装的 skill
  2. 扫描 node_modules 中全局安装的 CLI 工具
  3. 扫描 scripts/ 下的自有脚本
  4. 生成 memory/core/toolbox/_index.md
```

## 四、经验模式模板

```markdown
---
name: <kebab-case-name>
type: pattern
date: YYYY-MM-DD
tags: [tag1, tag2]
status: draft | verified | deprecated
source: <触发这个经验的任务>
---

# <一句话描述这个模式>

## 场景
什么时候会遇到这个问题？

## 错误路径
尝试了什么？为什么失败了？

## 正确路径
最终怎么解决的？

## 可复用性
下次遇到类似问题可以直接用吗？有什么前提条件？

## 相关工具
- <工具名>: <一句话>
```

## 五、自动触发规则

| 触发条件 | 动作 |
|----------|------|
| 用户说"帮我开发 X" | 先跑 `research.mjs X` 预研 |
| 用户说"安装"/"配置"某工具 | 安装成功后自动写入 `toolbox/` |
| daily 中出现"踩坑"/"解决"/"改用" | 自动提取为 pattern |
| 每周日 | 跑 `toolbox-scan.mjs` 盘点 |
| 每月 | 跑 `research.mjs` 全量更新 |

## 六、今天的例子

如果今天有这个架构，modfactory 的流程会是：

```
1. 用户说"帮我做视频展示 + 设计立体字"
2. Phase 0: research.mjs "video demo minecraft mod" + "ascii art 3d text cli"
   → 发现：figlet-cli (npm), taste-skill (已安装), remotion (已有)
   → 安装 figlet-cli，测试字体
3. Phase 1: 执行——OBS 录制、FIGlet 生成艺术字、taste-skill 做落地页
4. Phase 2: 提取——
   → pattern: "FIGlet ANSI Shadow 字体适合 Minecraft 风格 README"
   → pattern: "taste-skill 暗色科技风落地页，VARIANCE 6/MOTION 4/DENSITY 3"
   → toolbox: figlet-cli, taste-skill
5. Phase 3: 索引——下次做 README 美化时自动检索到这些经验
```

## 七、实施路线

| 优先级 | 组件 | 工作量 | 触发 |
|--------|------|--------|------|
| 🔴 今天 | `memory/core/patterns/` + 模板 | 10min | 人工写入第一批 |
| 🔴 今天 | `memory/core/toolbox/_index.md` | 5min | 盘点现有工具 |
| 🟡 本周 | `scripts/research.mjs` | 30min | GitHub 搜索集成 |
| 🟡 本周 | `scripts/extract-pattern.mjs` | 20min | daily 自动提取 |
| 🟢 下周 | `scripts/toolbox-scan.mjs` | 15min | 自动盘点 |
| 🟢 下周 | CLAUDE.md 更新——自动预研 | 5min | 启动时加载 |
