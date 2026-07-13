#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const forbidden = [
  /\/Users\/[^/\s]+/,
  /[A-Za-z]:[\\/]Users[\\/][^\\/\s]+/,
  /(?:password|api[_-]?key|access[_-]?token|gh[_-]?token|authorization|_authToken|cookie)["']?\s*[:=]\s*["']?[^\s"'$<]+/i,
  /(?:\b\d{1,3}\.){3}\d{1,3}\b/,
  /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/,
  /\bowner\s*[:=]\s*[\p{Script=Han}]{2,4}\b/iu,
];
const excluded = new Set(['scripts/privacy-scan.mjs']);
const forbiddenPaths = [
  /^runtime\//,
  /(?:^|\/)control\.db$/,
  /(?:^|\/)memory\/(?:core|daily|captures|proposals)\/(?!\.gitkeep$)/,
  /(?:^|\/)memory\/archive\/(?!\.gitkeep$)/,
];
async function walk(dir = '.') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'index'].includes(entry.name)) continue;
    const path = dir === '.' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

let files;
let gitBacked = true;
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
} catch {
  gitBacked = false;
  files = await walk();
}
const findings = [];
for (const file of files) {
  if (excluded.has(file)) continue;
  const contents = [];
  if (gitBacked) {
    try { contents.push({ source: 'index', value: execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }) }); } catch {}
  }
  try { contents.push({ source: 'worktree', value: await readFile(file, 'utf8') }); } catch {}
  if (!contents.length) continue;
  forbiddenPaths.forEach((pattern) => { if (pattern.test(file)) findings.push({ file, pattern: `path:${pattern.source}` }); });
  if (file.startsWith('memory/') && !file.startsWith('memory/_schemas/') && !file.endsWith('/.gitkeep')) {
    findings.push({ file, pattern: 'path:non-schema-memory' });
  }
  if (/(?:^|\/)\.env$/.test(file) || (/(?:^|\/)\.env\./.test(file) && !file.endsWith('.env.example'))) {
    findings.push({ file, pattern: 'path:environment-file' });
  }
  for (const content of contents) {
    forbidden.forEach((pattern) => { if (pattern.test(content.value)) findings.push({ file, source: content.source, pattern: pattern.source }); });
  }
}
console.log(JSON.stringify({ ok: findings.length === 0, scannedFiles: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
