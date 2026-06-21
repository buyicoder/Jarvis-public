import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const EDGE_PROFILE = 'C:/Users/Lenovo/AppData/Local/Microsoft/Edge/User Data';

console.log('🚀 启动 Edge，复用你的登录态...\n');

// 用持久化 context 复用 Edge profile
const context = await chromium.launchPersistentContext(EDGE_PROFILE, {
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: false,
  args: ['--disable-features=AppBoundEncryption'],
});

const page = await context.newPage();

// Step 1: 打开 Doubao
console.log('📄 打开 Doubao...');
await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

// Step 2: 无限滚动加载全部对话
console.log('📋 提取对话列表（滚动加载中）...');

await page.goto('https://www.doubao.com/chat/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);

// 先确认用户已登录
const isLoggedIn = await page.evaluate(() => {
  return document.body.innerText.includes('豆包') && !document.body.innerText.includes('登录');
});
console.log(`   登录状态: ${isLoggedIn ? '✅ 已登录' : '⚠️ 未登录'}`);

// 收集对话链接的函数
async function collectThreads(page) {
  return await page.evaluate(() => {
    const items = [];
    const seen = new Set();
    const selectors = [
      'a[href*="/chat/"]',
      '[class*="thread"] a',
      '[class*="conversation"] a',
      'nav a',
      'aside a',
      '[class*="sidebar"] a',
      '[class*="history"] a',
      '[class*="list"] a',
      'a[href*="thread"]',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        const href = el.getAttribute('href');
        const text = el.textContent?.trim()?.slice(0, 200);
        if (href && text && href.match(/\/chat\/\d+/) && !seen.has(href)) {
          seen.add(href);
          items.push({ href, title: text });
        }
      });
    }
    return items;
  });
}

// 找到侧边栏并滚动
let allThreads = await collectThreads(page);
console.log(`   初始: ${allThreads.length} 个对话`);

// 尝试找到滚动容器并持续滚动
let noNewCount = 0;
let scrollAttempts = 0;
const maxScrolls = 50;

while (scrollAttempts < maxScrolls && noNewCount < 5) {
  scrollAttempts++;

  // 尝试多种侧边栏选择器
  const scrolled = await page.evaluate(() => {
    const scrollSelectors = [
      '[class*="sidebar"]',
      '[class*="thread-list"]',
      '[class*="conversation-list"]',
      '[class*="history"]',
      'nav',
      'aside',
      '[class*="scroll"]',
    ];
    for (const sel of scrollSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 50) {
        el.scrollTop = el.scrollHeight;
        return true;
      }
    }
    // fallback: 滚动整个页面
    window.scrollTo(0, document.body.scrollHeight);
    return true;
  });

  await page.waitForTimeout(1500);

  const newThreads = await collectThreads(page);
  const newCount = newThreads.length - allThreads.length;

  if (newCount > 0) {
    allThreads = newThreads;
    noNewCount = 0;
    console.log(`   滚动 ${scrollAttempts}: +${newCount} → 共 ${allThreads.length} 个`);
  } else {
    noNewCount++;
  }
}

console.log(`   最终: ${allThreads.length} 个对话`);

// 如果侧边栏滚动没效果，尝试 SSR 分页
if (allThreads.length <= 22) {
  console.log('\n   侧边栏滚动效果有限，尝试 SSR 分页...');
  for (let pg = 1; pg <= 30; pg++) {
    try {
      await page.goto(`https://www.doubao.com/code_chat/thread/list/page?p=${pg}`, {
        waitUntil: 'domcontentloaded', timeout: 30000
      });
      await page.waitForTimeout(2000);
      const links = await collectThreads(page);
      if (!links.length) { console.log(`   Page ${pg}: 无数据，停止`); break; }
      // 合并去重
      const oldLen = allThreads.length;
      for (const l of links) {
        if (!allThreads.find(t => t.href === l.href)) allThreads.push(l);
      }
      const newOnes = allThreads.length - oldLen;
      console.log(`   Page ${pg}: ${links.length} 个 (新增 ${newOnes})`);
      if (newOnes === 0) { console.log('   无新对话，停止'); break; }
    } catch (e) {
      console.log(`   Page ${pg}: 出错 - ${e.message.slice(0,40)}`);
      break;
    }
  }
  console.log(`   SSR 合并后: ${allThreads.length} 个对话`);
}

// 去重 + 过滤
allThreads = allThreads.filter(t => t.href.match(/\/chat\/\d+/));
allThreads = [...new Map(allThreads.map(t => [t.href, t])).values()];
console.log(`\n📊 去重后共 ${allThreads.length} 个对话\n`);

console.log(`\n📊 共 ${allThreads.length} 个对话\n`);

// Step 3: 遍历每个对话，导航到页面抓取内容
const allConversations = [];

for (let i = 0; i < allThreads.length; i++) {
  const t = allThreads[i];
  const href = t.href;
  const title = t.title || '未命名';
  const id = href.split('/').pop();
  console.log(`[${i+1}/${allThreads.length}] ${title.slice(0, 60)}`);

  try {
    // 导航到对话页面
    const chatUrl = href.startsWith('http') ? href : `https://www.doubao.com${href}`;
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // 从 DOM 提取对话内容
    const content = await page.evaluate(() => {
      const texts = [];
      // Doubao 的消息容器
      const selectors = [
        '[class*="message-content"]',
        '[class*="bubble"]',
        '[class*="chat-message"]',
        '[class*="conversation-turn"]',
        '[class*="agent"]',
        'main [class*="content"]',
        '.message',
        '[data-testid="message"]',
        'article',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 3) texts.push(text);
        });
      }
      // 如果上面都没找到，尝试整个聊天区域
      if (!texts.length) {
        const main = document.querySelector('main') || document.querySelector('[class*="chat"]');
        if (main) texts.push(main.textContent?.trim());
      }
      return texts.join('\n---\n');
    });

    if (content && content.length > 20) {
      allConversations.push({ id, title, href: chatUrl, content });
      console.log(`   ✅ ${content.length} 字符`);
    } else {
      // 备用：直接截图保存对话文本
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 10000));
      allConversations.push({ id, title, href: chatUrl, content: bodyText });
      console.log(`   ⚠️ 回退提取: ${bodyText.length} 字符`);
    }
  } catch (e) {
    console.log(`   ❌ ${e.message.slice(0, 60)}`);
    allConversations.push({ id, title, error: e.message });
  }

  // 保存中间结果
  writeFileSync('knowledge-base/doubao-export.json', JSON.stringify(allConversations, null, 2), 'utf-8');
  await page.waitForTimeout(800);
}

// 保存结果
const outputFile = 'knowledge-base/doubao-export.json';
writeFileSync(outputFile, JSON.stringify(allConversations, null, 2), 'utf-8');
console.log(`\n✅ 导出完成: ${outputFile}`);
console.log(`   共 ${allConversations.length} 个对话`);

await context.close();
