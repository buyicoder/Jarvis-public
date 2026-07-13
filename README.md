# Jarvis

**简体中文** | [English](README.en.md)

Jarvis 是一个本地优先的个人 AI 幕僚长与工作控制台：帮助你沉淀信息、梳理决策、跟踪任务，并在本机查看当前工作状态。它不是万能聊天机器人，也不会替你自动执行所有事情。

> **开发者预览版 `1.0.0-preview.1`** — 支持运行 macOS 12 或更高版本的 Apple 芯片 Mac。当前应用仅做 ad-hoc 签名，**未使用 Developer ID 签名，也未经过 Apple 公证**；没有自动更新，不应视为稳定版。请备份你创建的数据。

[下载 macOS arm64 DMG](https://github.com/buyicoder/Jarvis-public/releases/download/v1.0.0-preview.1/Jarvis-1.0.0-preview.1-arm64.dmg) · [下载 ZIP](https://github.com/buyicoder/Jarvis-public/releases/download/v1.0.0-preview.1/Jarvis-1.0.0-preview.1-arm64.zip) · [SHA256SUMS](https://github.com/buyicoder/Jarvis-public/releases/download/v1.0.0-preview.1/SHA256SUMS)

你的数据默认只保存在本机。应用和公开仓库不会附带任何人的私人 Vault 内容。完整安装说明见[开发者预览版指南](docs/developer-preview.md)，版本记录见 [`v1.0.0-preview.1` 发布说明](docs/releases/v1.0.0-preview.1.md)。

## Jarvis 能做什么

Jarvis 把日常输入整理成一条需要你确认的工作流：

```text
记录 → 确定性提炼 → 生成提案 → 审批 → 明确写入
```

当前公开版包括：

- **记忆工作流：** 记录素材、提炼建议、预览与批准提案，最后通过 `apply --yes` 明确写入。
- **本地控制面：** 使用本地 SQLite 管理任务、事件、报告、决策、权限快照和自动化状态，并提供校验、备份与恢复。
- **War Room：** 在桌面界面查看当前未解决事项和历史时间线。
- **Vault 工具：** 提供复制式迁移计划、哈希校验和显式切换，不自动删除旧数据。
- **检索与治理：** 本地向量检索、BM25 回退、模型推荐与用量遥测；模型路由只给出建议，不自动更改你的模型配置。
- **可选集成：** provider、Codex 状态、浏览器活动、自动化和联网研究均默认关闭，未配置时安全降级。

当前预览版仍需要用户主动确认关键写入，也不提供账号、云同步、自动更新或托管模型密钥。

## 下载、安装与首次启动

下载版仅支持 Apple 芯片 Mac（arm64），最低系统版本为 macOS 12，不需要安装 Node.js。

1. 从上方链接下载 DMG；建议同时下载 `SHA256SUMS` 并核对校验值。
2. 打开 DMG，把 `Jarvis.app` 拖入 `/Applications`。
3. 由于应用尚未公证，macOS 可能阻止普通双击。核对校验值后，在 Finder 中按住 Control 点击应用，选择**打开**，再确认**打开**。
4. 不要为此全局关闭 Gatekeeper。

首次启动会创建一个空的本地工作区，不会自动导入其他 Jarvis 数据。详细的校验、故障排查、卸载和回滚步骤见[开发者预览版指南](docs/developer-preview.md)。

## 初始化合成演示工作区

演示数据完全由合成项目、任务、决策和报告组成。初始化是可选操作，只允许写入新的空 Vault/runtime；检测到现有状态时会拒绝覆盖。

在桌面应用中使用演示初始化入口，或在源码目录运行：

```bash
node bin/jarvis.mjs demo init --yes
```

## 从源码运行 CLI

源码工作流需要 Node.js 22.13 或更高版本：

```bash
git clone https://github.com/buyicoder/Jarvis-public.git
cd Jarvis-public
npm install
npm run bootstrap
npm run doctor
```

启动桌面应用：

```bash
npm run desktop
```

本地构建并验证 macOS 安装包：

```bash
npm run release:gate:package
```

该门禁会启动真实的打包后 Electron 窗口、执行一次主要交互、把验证证据保存到仓库外，并扫描安装包中禁止出现的私人状态。它不会把 ad-hoc 签名的应用变成已公证版本。

## 常用命令

```bash
# 记录一条素材
node bin/jarvis.mjs capture "一条可复用的观察" --type learning

# 生成提案
node bin/jarvis.mjs distill --write-proposal

# 预览、批准并明确写入
node bin/jarvis.mjs proposal preview
node bin/jarvis.mjs proposal approve
node bin/jarvis.mjs apply --yes

# 查看完整命令列表
node bin/jarvis.mjs help
```

## 数据位置与卸载

| 使用方式 | 私人数据 | 运行状态 |
| --- | --- | --- |
| 源码 CLI | `~/.jarvis/vault` | `~/.jarvis/runtime` |
| 打包后的桌面应用 | `~/Library/Application Support/Jarvis/vault` | `~/Library/Application Support/Jarvis/runtime` |

仓库内 Vault 默认会被拒绝；只有显式设置 `JARVIS_LEGACY_REPO_MEMORY=1` 才启用旧版兼容模式。

卸载应用时可以从 `/Applications` 删除 `Jarvis.app`。这不会自动删除上述本地数据目录；确认不再需要数据并完成备份后，再由你手动处理。重新安装应用也不会主动覆盖现有 Vault。

## 隐私与安全默认值

- Git 仓库和发布包只包含代码、测试、文档、插件、skills 与脱敏 schema。
- captures、daily、身份、项目、决策、报告、数据库、证据和索引保存在仓库外。
- 活动采集默认关闭；显式启用并提供路径后，只保留聚合后的域名、次数和小时证据。
- 研究 radar 只有在传入 `--network` 时才访问网络。
- provider 与 Codex 适配器未配置时返回受控的不可用状态。
- 单次 capture 不会直接修改核心记忆；必须先审批，再执行 `apply --yes`。
- Electron 窗口启用沙箱与上下文隔离，关闭 Node integration，只连接临时的本机回环服务。

更多细节见[架构说明](docs/architecture.md)、[隐私威胁模型](docs/privacy-threat-model.md)、[迁移指南](docs/migration.md)和[公开能力矩阵](docs/public-parity.md)。

## 当前限制

- 仅提供 Apple 芯片（arm64）macOS 版本，最低 macOS 12。
- Developer Preview 未使用 Developer ID 签名、未经 Apple 公证，Gatekeeper 会显示相应提示。
- 没有自动更新；升级前请阅读对应版本说明并备份数据。
- 功能与数据格式仍可能在后续预览版调整，不适合当作稳定生产工具依赖。
- 可选适配器默认关闭，某些能力需要用户主动配置或授权；本地基础流程无需 API key、Codex、浏览器或网络连接。

## 架构与参与贡献

- [架构说明](docs/architecture.md)
- [隐私威胁模型](docs/privacy-threat-model.md)
- [迁移指南](docs/migration.md)
- [公开能力矩阵](docs/public-parity.md)
- [贡献指南](CONTRIBUTING.md)

提交变更前请运行：

```bash
npm test
npm run privacy:scan
npm run release:check
git diff --check
```

隐私扫描覆盖 Git index/worktree、无 `.git` 目录、npm tarball 和打包应用资源。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
