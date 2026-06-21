---
name: tutorial-doubao-export
type: reference
date: 2026-06-20
tags: [教程, 豆包, Playwright, 自动化, 数据导出]
---

# 导出豆包聊天记录：完整教程

## 适用场景

豆包（Doubao）桌面应用和网页版的聊天记录存储在 ByteDance 云端，本地没有任何可读的聊天数据。要批量导出全部对话，唯一可行的方法是**用浏览器自动化工具（Playwright）复用 Edge 登录态，模拟人工翻页导出**。

本教程记录从零到全量导出的完整过程，包括踩过的坑。

---

## 核心难点

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 本地文件没有聊天记录 | 豆包数据全在云端 | 不需要折腾本地文件 |
| Cookies 无法解密 | Edge 启用了 App-Bound Encryption (ABE)，密钥绑定到 Edge 进程 | 放弃解密，改用 Playwright 连接现有浏览器 |
| API 返回 401 | 认证需要完整的浏览器 cookie 链，不是单个 token | 用 `launchPersistentContext` 复用完整登录态 |
| API 返回 HTML 而非 JSON | 豆包的线程列表和消息详情都是 SSR 页面 | 直接导航到页面，从 DOM 提取内容 |

---

## 完整步骤

### Step 1：安装 Playwright

```bash
npm install playwright
```

不需要 `npx playwright install chromium`——直接用系统已有的 Edge 浏览器。

### Step 2：编写导出脚本

关键代码骨架（完整脚本见附录）：

```js
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

// 1. 用 Edge 的持久化 profile 启动浏览器，复用登录态
const context = await chromium.launchPersistentContext(
  'C:/Users/<用户名>/AppData/Local/Microsoft/Edge/User Data',
  {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: false,
  }
);

const page = await context.newPage();

// 2. 打开豆包主界面
await page.goto('https://www.doubao.com/chat/', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
await page.waitForTimeout(8000);

// 3. 从 DOM 提取对话列表
const threads = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('a[href*="/chat/"]').forEach(a => {
    const href = a.getAttribute('href');
    const text = a.textContent?.trim()?.slice(0, 200);
    if (href && text) items.push({ href, title: text });
  });
  return items;
});

// 4. 逐个导航到对话页面，提取内容
const results = [];
for (const t of threads) {
  await page.goto(`https://www.doubao.com${t.href}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(4000);

  const content = await page.evaluate(() => {
    // 从主内容区或整个页面提取对话文本
    return document.body.innerText.slice(0, 50000);
  });

  results.push({ title: t.title, content });
  writeFileSync('doubao-export.json', JSON.stringify(results, null, 2));
}

await context.close();
```

### Step 3：运行前准备

**关闭所有 Edge 窗口。** Playwright 需要独占用户数据目录。如果有残留进程：

```bash
taskkill //F //IM msedge.exe
```

### Step 4：运行

```bash
node scripts/export-doubao.mjs
```

浏览器窗口会自动打开，导航到豆包，翻页扒取对话。过程中不要手动操作那个窗口。22 个对话约需 5-8 分钟。

---

## 踩过的坑

### 坑 1：尝试解密本地 Cookies（失败）

**做了什么**：读取 Edge 的 `Cookies` SQLite 数据库 → 用 DPAPI 解密 `encrypted_key` → 尝试 AES-GCM 解密 cookie 值。

**为什么失败**：Edge 启用了 App-Bound Encryption (ABE)。加密密钥不是单纯用 Windows DPAPI 加密的，而是绑定到 Edge 应用程序本身。标准的 `CryptUnprotectData` 无法解密。即使 DPAPI 调用成功拿到 32 字节 AES key，解密 cookie 也会返回 "Unsupported state or unable to authenticate data"。

**教训**：不要尝试解密 Chromium 浏览器的 cookies。直接用浏览器自动化绕过。

### 坑 2：尝试用 Console JS 调用 API（失败）

**做了什么**：在浏览器 Console 里用 `fetch()` 调用 `/api/chat/thread/list`。

**为什么失败**：豆包的 JSON API（`/api/*` 路径）使用与网页端不同的认证机制。`credentials: 'include'` 不够，需要特定的字节跳动内部 header（`x-tt-env`、`x-use-ppe` 等），或 CSRF token 的特定传递方式。返回 401。

**教训**：API 路径返回 HTML（SSR），而非 JSON。需要通过页面导航 + DOM 抓取。

### 坑 3：尝试用 `launchPersistentContext` + `channel: 'msedge'`（失败）

**做什么**：使用 Playwright 的 `channel: 'msedge'` 参数。

**为什么失败**：`launchPersistentContext` 不支持 `channel` 参数。需要用 `executablePath` 直接指定 Edge 可执行文件路径。

### 坑 4：`networkidle` 超时

**做什么**：`page.goto({ waitUntil: 'networkidle' })`

**为什么失败**：豆包页面有长连接（WebSocket、SSE、埋点上报），永远不会 `networkidle`。30秒后超时。

**正确做法**：使用 `waitUntil: 'domcontentloaded'` + 主动 `waitForTimeout`。

### 坑 5：Edge 后台进程残留

**做什么**：用完 Playwright 后直接重新打开 Edge。

**现象**：Edge 可能残留后台进程，下次启动 Playwright 时报"另一个程序正在使用此文件"。

**正确做法**：每次运行前 `taskkill //F //IM msedge.exe`。

---

## 最终可用的导出脚本

见 `scripts/export-doubao.mjs`（已提交到 Jarvis 仓库）。

运行：

```bash
# 1. 关闭 Edge
taskkill //F //IM msedge.exe

# 2. 导出
cd D:/AIZZL/Jarvis && node scripts/export-doubao.mjs

# 3. 查看结果
node scripts/summarize-doubao.mjs
```

导出文件：
- `knowledge-base/doubao-export.json` — 完整导出（22 个对话，139K 字）
- `knowledge-base/doubao-key-conversations.json` — 关键对话精选
- `knowledge-base/doubao-analysis.md` — 内容分析报告
