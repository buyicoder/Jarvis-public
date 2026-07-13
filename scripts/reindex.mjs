import { readdirSync, existsSync } from 'fs';
import { relative, resolve } from 'path';
import { execSync } from 'child_process';
import { readMarkdown, chunkMarkdown } from './lib/knowledge-base.mjs';
import { clearAll, upsertChunksWithIndex } from './lib/vector-store.mjs';
import { CONFIG } from './lib/config.mjs';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODEL_ONNX = resolve(ROOT, 'index', 'models', 'bge-small-zh-v1.5', 'onnx', 'model.onnx');

if (!existsSync(MODEL_ONNX)) {
  console.log('📥 Model not found, downloading...');
  execSync('node scripts/download-model.mjs', { stdio: 'inherit', cwd: ROOT });
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
        const rel = relative(CONFIG.memoryDir, p).replace(/\\/g, '/');
        const chunks = chunkMarkdown(doc.content, { source: rel, date: '2026-06-20', type: 'memory' });
        allChunks.push(...chunks);
      }
    }
  }
}

scanDir(CONFIG.memoryDir);
console.log('Total chunks found:', allChunks.length);

if (allChunks.length > 0) {
  await clearAll();
  const result = await upsertChunksWithIndex(allChunks);
  console.log('Re-indexed:', result.inserted, 'chunks (BM25 + vector)');
}

// Test search
const { search } = await import('./lib/vector-store.mjs');
const r = await search('release checklist');
console.log('\nTest search "release checklist":', r.length, 'results');
if (r.length > 0) console.log('  Top:', r[0].source, '| dist:', r[0]._distance.toFixed(3));
