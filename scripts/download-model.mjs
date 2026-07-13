#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODEL_DIR = resolve(ROOT, 'index', 'models', 'bge-small-zh-v1.5');
const ONNX_DIR = resolve(MODEL_DIR, 'onnx');

const FILES = [
  { path: 'onnx/model.onnx', size: '91MB' },
  { path: 'tokenizer.json', size: '429KB' },
  { path: 'tokenizer_config.json', size: '367B' },
  { path: 'config.json', size: '716B' },
];

const BASE = 'https://huggingface.co/Xenova/bge-small-zh-v1.5/resolve/main';

async function main() {
  mkdirSync(ONNX_DIR, { recursive: true });

  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || '';

  for (const f of FILES) {
    const dest = resolve(MODEL_DIR, f.path);
    if (existsSync(dest)) {
      console.log(`  ✅ ${f.path} (cached)`);
      continue;
    }

    const url = `${BASE}/${f.path}`;
    console.log(`  📥 ${f.path} (${f.size})...`);

    try {
      const args = ['-s', '-L', url, '-o', dest];
      if (proxy) args.unshift('--proxy', proxy);
      execFileSync('curl', args, {
        stdio: 'pipe',
        timeout: 120000,
      });
      console.log(`     done`);
    } catch (e) {
      console.error(`  ❌ Failed: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('  ✅ Model ready');
}

main();
