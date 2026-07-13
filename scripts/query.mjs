#!/usr/bin/env node
import { search } from './lib/vector-store.mjs';

async function main() {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.log('用法: node scripts/query.mjs "查询文本"');
    console.log('示例: node scripts/query.mjs "release checklist"');
    process.exit(1);
  }

  console.log(`🔍 搜索: "${query}"\n`);

  const results = await search(query);

  if (results.length === 0) {
    console.log('未找到相关结果。');
    return;
  }

  results.forEach((r, i) => {
    const similarity = ((1 - r._distance) * 100).toFixed(1);
    console.log(`[${i + 1}] 相似度 ${similarity}% | 来源: ${r.source}`);
    console.log(`    ${r.content.slice(0, 200).replace(/\n/g, ' ')}...`);
    console.log('');
  });

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results.map(r => ({
      source: r.source,
      content: r.content,
      similarity: (1 - r._distance).toFixed(4),
    })), null, 2));
  }
}

main().catch(err => {
  console.error('❌ 搜索失败:', err.message);
  process.exit(1);
});
