#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { CONFIG } from './lib/config.mjs';
import { readMarkdown, chunkMarkdown, getDailyPath } from './lib/knowledge-base.mjs';
import { upsertChunks } from './lib/vector-store.mjs';
import { buildVocabulary } from './lib/embedding.mjs';

const HEALTH_PATH = resolve(CONFIG.rootDir, 'index', '_health.json');

async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().slice(0, 10);
  console.log(`📅 索引日期: ${dateStr}`);

  let totalChunks = 0;

  // 1. 索引 daily 文件
  const dailyPath = getDailyPath(dateStr);
  if (existsSync(dailyPath)) {
    const doc = readMarkdown(dailyPath);
    if (doc && doc.content.trim()) {
      const dailyProject = doc.data.projects || [];
      const chunks = chunkMarkdown(doc.content, {
        source: `daily/${dateStr.slice(0, 4)}/${dateStr.slice(5, 7)}/${dateStr}.md`,
        project: Array.isArray(dailyProject) ? dailyProject.join(',') : dailyProject,
        date: dateStr,
        type: 'daily_log',
      });
      const result = await upsertChunks(chunks);
      totalChunks += result.inserted;
      console.log(`  ✅ daily → ${result.inserted} chunks`);
    } else { console.log(`  ⚠️ daily 内容为空`); }
  } else { console.log(`  ⚠️ daily 不存在`); }

  // 2. 索引 conversations
  const convDir = CONFIG.conversationsDir;
  if (existsSync(convDir)) {
    const convFiles = readdirSync(convDir).filter(f => f.startsWith(dateStr) && f.endsWith('.md'));
    for (const f of convFiles) {
      const doc = readMarkdown(resolve(convDir, f));
      if (doc && doc.content.trim()) {
        const chunks = chunkMarkdown(doc.content, { source: `conversations/${f}`, date: dateStr, type: 'conversation' });
        const result = await upsertChunks(chunks);
        totalChunks += result.inserted;
        console.log(`  ✅ conversations/${f} → ${result.inserted} chunks`);
      }
    }
  }

  console.log(`\n📊 总计索引 ${totalChunks} 个 chunks`);

  // 3. 词表覆盖率检测 — 如果新词太多，自动重建
  const vocabPath = resolve(CONFIG.vectorDbDir, 'vocabulary.json');
  if (existsSync(vocabPath) && totalChunks > 0) {
    const vocab = JSON.parse(readFileSync(vocabPath, 'utf-8'));
    const vocabSize = Object.keys(vocab.vocabulary || {}).length;

    // 扫描所有 daily 文件统计总 chunks
    let totalExisting = 0;
    function countChunks(dir) {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, {withFileTypes: true})) {
        if (e.isDirectory()) countChunks(resolve(dir, e.name));
        else if (e.name.endsWith('.md')) {
          const d = readMarkdown(resolve(dir, e.name));
          if (d?.content) totalExisting += chunkMarkdown(d.content, {}).length;
        }
      }
    }
    countChunks(CONFIG.dailyDir);

    const newRatio = totalChunks / Math.max(totalExisting, 1);
    console.log(`  词表: ${vocabSize} 词, 新增比 ${(newRatio*100).toFixed(0)}%`);

    if (newRatio > 0.1) {
      console.log('  ⚠️ 覆盖率下降，自动重建词表...');
      const { readdirSync: rd } = await import('fs');
      const allTexts = [];
      function collect(dir) {
        if (!existsSync(dir)) return;
        for (const e of rd(dir, {withFileTypes: true})) {
          if (e.isDirectory()) collect(resolve(dir, e.name));
          else if (e.name.endsWith('.md')) {
            const d = readMarkdown(resolve(dir, e.name));
            if (d?.content) allTexts.push(d.content);
          }
        }
      }
      collect(CONFIG.memoryDir);
      buildVocabulary(allTexts);
      console.log('  ✅ 词表已重建');
    }
  }

  // 4. 健康监控
  const health = { date: dateStr, chunks_indexed: totalChunks, vocabulary_size: 0, freshness: 0, usage_chars: 0 };
  try {
    const v = JSON.parse(readFileSync(vocabPath, 'utf-8'));
    health.vocabulary_size = Object.keys(v.vocabulary || {}).length;
  } catch {}
  if (existsSync(dailyPath)) {
    health.usage_chars = readFileSync(dailyPath, 'utf-8').length;
  }
  // freshness: 最近 7 天 chunks 占比（简化用）
  let recentChunks = 0, totalAllChunks = 0;
  try {
    const weekAgo = new Date(dateStr); weekAgo.setDate(weekAgo.getDate() - 7);
    const ws = weekAgo.toISOString().slice(0, 10);
    const allFiles = readdirSync(CONFIG.dailyDir, {recursive: true}).filter(f=>f.endsWith('.md'));
    totalAllChunks = allFiles.length;
    recentChunks = allFiles.filter(f => f >= ws).length;
  } catch {}
  health.freshness = totalAllChunks > 0 ? recentChunks / totalAllChunks : 0;

  mkdirSync(resolve(CONFIG.rootDir, 'index'), {recursive: true});
  writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2));
  console.log(`  🩺 health: vocab=${health.vocabulary_size}, fresh=${(health.freshness*100).toFixed(0)}%, usage=${health.usage_chars}chars`);
}

main().catch(err => {
  console.error('❌ 索引失败:', err.message);
  process.exit(1);
});
