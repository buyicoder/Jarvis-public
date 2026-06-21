---
name: toolbox-index
type: toolbox
date: 2026-06-21
---

# Jarvis 工具箱

> 已知的可用工具、技能、库。持续更新。

## 🎨 设计/视觉

| 工具 | 用途 | 安装 | 状态 |
|------|------|------|------|
| figlet-cli | 命令行 ASCII 艺术字生成 | `npm install figlet-cli` | ✅ 已验证 |
| taste-skill | 前端设计品味注入（47K☆） | `git clone` 到 `.claude/skills/` | ✅ 已安装 |
| Remotion | React 代码生成视频 | 已有项目 `D:/remotion/` | ✅ 已有 |

## 🔍 数据采集

| 工具 | 用途 | 安装 | 状态 |
|------|------|------|------|
| Playwright | 浏览器自动化（Edge 登录态导出） | `npm install playwright` | ✅ 已验证 |
| Edge History SQLite | 浏览器历史/搜索词提取 | 内置（需先关 Edge） | ✅ 已验证 |
| classic-level | LevelDB 读取（IndexedDB） | `npm install classic-level` | ✅ 已验证 |

## 🧠 AI/嵌入

| 工具 | 用途 | 安装 | 状态 |
|------|------|------|------|
| @huggingface/transformers | 本地 embedding 模型 | `npm install` + 手动下载模型 | ✅ 已验证 |
| bge-small-zh-v1.5 | 中文语义向量 512维 | 91MB 本地 ONNX | ✅ 已部署 |
| LanceDB | 嵌入式向量库 | `npm install @lancedb/lancedb` | ✅ 已部署 |
| natural | 纯JS NLP（TF-IDF 备用） | `npm install natural` | 🟡 备用 |

## 📋 数据处理

| 工具 | 用途 | 安装 | 状态 |
|------|------|------|------|
| xlsx | Excel/CSV 解析（消费记录） | `npm install xlsx` | ✅ 已验证 |
| iconv-lite | GBK/多编码解码（支付宝CSV） | `npm install iconv-lite` | ✅ 已验证 |
| gray-matter | Markdown frontmatter 解析 | 已在 package.json | ✅ 已部署 |
| natural | 纯JS NLP | 已在 package.json | 🟡 备用 |

## 📦 系统管理

| 工具 | 用途 | 安装 | 状态 |
|------|------|------|------|
| node:sqlite | Node 内置 SQLite（Edge 数据库） | Node 24 内置 | ✅ 已验证 |
| winget list | Windows 软件清单 | 系统内置 | ✅ 已验证 |
| gh CLI | GitHub 操作 | 未安装 | ⬜ 待安装 |
| git log | 提交历史分析 | 系统内置 | ✅ 已验证 |
