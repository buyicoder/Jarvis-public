import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('knowledge-base/doubao-export.json', 'utf-8'));

console.log('=== 豆包对话导出总结 ===\n');
console.log('总对话数:', data.length);
console.log('总字数:', data.reduce((s, d) => s + (d.content || '').length, 0));
console.log('');

// 按长度排序
const sorted = [...data].sort((a, b) => (b.content || '').length - (a.content || '').length);

// 提取关键对话的前 300 字
const keyTopics = ['AI', 'Codex', '变现', '工作流', '技术入股', '盈利', '企业', '文案', '小说', '知识库'];

for (const d of sorted) {
  const content = d.content || '';
  const title = d.title || '无标题';
  const isKey = keyTopics.some(k => title.includes(k));
  const marker = isKey ? '⭐' : '  ';
  console.log(`${marker} [${content.length}字] ${title.slice(0, 80)}`);
}

// 输出关键对话内容摘要到文件
console.log('\n\n=== 关键对话内容提取 ===\n');
const important = sorted.filter(d => keyTopics.some(k => (d.title || '').includes(k)));

for (const d of important) {
  console.log(`\n### ${d.title}`);
  console.log(`(字数: ${(d.content||'').length})`);
  console.log('---');
  // 取前 600 字
  console.log((d.content || '').slice(0, 600));
  console.log('...\n');
}

// 也保存一份精简版到文件
const summary = important.map(d => ({
  title: d.title,
  length: (d.content||'').length,
  preview: (d.content||'').slice(0, 2000),
}));
writeFileSync('knowledge-base/doubao-key-conversations.json', JSON.stringify(summary, null, 2), 'utf-8');
console.log('精简版已保存到 knowledge-base/doubao-key-conversations.json');
