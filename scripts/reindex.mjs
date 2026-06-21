import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { readMarkdown, chunkMarkdown } from './lib/knowledge-base.mjs';
import { clearAll, upsertChunks } from './lib/vector-store.mjs';

const MODEL_ONNX = resolve(import.meta.dirname || '.', '..', 'index', 'models', 'bge-small-zh-v1.5', 'onnx', 'model.onnx');

if (!existsSync(MODEL_ONNX)) {
  console.log('📥 Model not found, downloading...');
  execSync('node scripts/download-model.mjs', { stdio: 'inherit', cwd: resolve(import.meta.dirname || '.', '..') });
}

const allChunks = [];

function scanDir(dir) {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, {withFileTypes: true});
  for (const e of entries) {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) { scanDir(p); }
    else if (e.name.endsWith('.md')) {
      const doc = readMarkdown(p);
      if (doc && doc.content.trim()) {
        const rel = p.replace(/\\/g, '/').split('memory/')[1] || e.name;
        const chunks = chunkMarkdown(doc.content, { source: rel, date: '2026-06-20', type: 'memory' });
        allChunks.push(...chunks);
      }
    }
  }
}

scanDir('memory');
console.log('Total chunks found:', allChunks.length);

if (allChunks.length > 0) {
  const allTexts = allChunks.map(c => c.content);
  buildVocabulary(allTexts);
  await clearAll();
  const result = await upsertChunks(allChunks);
  console.log('Re-indexed:', result.inserted, 'chunks');
}

// Test search
const { search } = await import('./lib/vector-store.mjs');
const r = await search('modfactory');
console.log('\nTest search "modfactory":', r.length, 'results');
if (r.length > 0) console.log('  Top:', r[0].source, '| dist:', r[0]._distance.toFixed(3));
