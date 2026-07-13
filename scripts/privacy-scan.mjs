#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, readlink, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const CONTENT_RULES = [
  ['mac-user-path', /\/Users\/(?!<|\$\{|user(?:name)?(?:\/|\b))[^/\s`'"]+/i],
  ['linux-user-path', /\/home\/(?!<|\$\{|user(?:name)?(?:\/|\b))[^/\s`'"]+/i],
  ['windows-user-path', /[A-Za-z]:[\\/]Users[\\/](?!<|%USERNAME%|user(?:name)?[\\/])[^\\/\s`'"]+/i],
  ['private-key', /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/],
  ['bearer-token', /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-key', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ['openai-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['assigned-secret', /(?:password|api[_-]?key|access[_-]?token|gh[_-]?token|authorization|_authToken|cookie)["']?\s*[:=]\s*["'][^"'$<\s]{8,}["']/i],
  ['identity-shaped-owner', /\b(?:owner|identity|full_name)\s*[:=]\s*["']?[一-鿿]{2,4}["']?\b/iu],
  ['private-server-ip', /\b(?!(?:127|0)\.)(?!169\.254\.)(?!224\.)(?:\d{1,3}\.){3}\d{1,3}\b/],
];

const PATH_RULES = [
  ['runtime', /(?:^|\/)runtime(?:\/|$)/i],
  ['database', /(?:^|\/)(?:control\.db|[^/]+\.(?:db|sqlite|sqlite3))(?:$|\/)/i],
  ['environment', /(?:^|\/)\.env(?:\.|$)/i],
  ['private-memory', /(?:^|\/)memory\/(?:core|daily|captures|proposals|conversations|scans|financial|archive)(?:\/|$)/i],
  ['operational-instance', /(?:^|\/)(?:reports?|ledger|roster|threads?|sessions?|cookies?|server-inventory)(?:\/|\.|-|$)/i],
  ['evidence-binary', /(?:^|\/)[^/]+\.(?:png|jpe?g|gif|webp|pdf)$/i],
  ['credential-file', /(?:^|\/)[^/]+\.(?:pem|key|p12|pfx)$/i],
];

const EXCLUDED_CONTENT = new Set(['scripts/privacy-scan.mjs']);

async function walk(root, current = root) {
  const items = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'index'].includes(entry.name)) continue;
    const path = join(current, entry.name);
    const file = relative(root, path).replaceAll('\\', '/');
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const target = resolve(dirname(path), await readlink(path));
      const rel = relative(join(root, 'node_modules'), target);
      const safeBinLink = file.startsWith('node_modules/.bin/') && !rel.startsWith('..') && !isAbsolute(rel);
      items.push({ file, path, kind: safeBinLink ? 'package-bin-link' : 'symlink' });
    }
    else if (info.isDirectory()) items.push(...await walk(root, path));
    else if (info.isFile()) items.push({ file, path, kind: 'file' });
    else items.push({ file, path, kind: 'special' });
  }
  return items;
}

function pathFindings(file, source) {
  const normalized = file.replace(/^package\//, '');
  const findings = [];
  for (const [rule, pattern] of PATH_RULES) if (pattern.test(normalized)) findings.push({ file: normalized, source, rule });
  if (normalized.startsWith('memory/') && !normalized.startsWith('memory/_schemas/')) findings.push({ file: normalized, source, rule: 'non-schema-memory' });
  return findings;
}

function contentFindings(file, source, content) {
  if (EXCLUDED_CONTENT.has(file.replace(/^package\//, ''))) return [];
  return CONTENT_RULES.filter(([, pattern]) => pattern.test(content)).map(([rule]) => ({ file: file.replace(/^package\//, ''), source, rule }));
}

async function scanDirectory(root, source = 'worktree') {
  const findings = [];
  const items = await walk(root);
  for (const item of items) {
    findings.push(...pathFindings(item.file, source));
    if (item.kind === 'package-bin-link') continue;
    if (item.kind !== 'file') { findings.push({ file: item.file, source, rule: item.kind }); continue; }
    try { findings.push(...contentFindings(item.file, source, await readFile(item.path, 'utf8'))); }
    catch (error) { findings.push({ file: item.file, source, rule: error.code === 'EACCES' ? 'unreadable' : 'read-failed' }); }
  }
  return { files: items.map((item) => item.file), findings };
}

async function scanGit(root) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const findings = [];
  for (const file of listed) {
    findings.push(...pathFindings(file, 'path'));
    const path = join(root, file);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) findings.push({ file, source: 'worktree', rule: 'symlink' });
      else if (!info.isFile()) findings.push({ file, source: 'worktree', rule: 'special' });
      else findings.push(...contentFindings(file, 'worktree', await readFile(path, 'utf8')));
    } catch (error) { findings.push({ file, source: 'worktree', rule: error.code === 'ENOENT' ? 'missing' : 'unreadable' }); }
    try { findings.push(...contentFindings(file, 'index', execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }))); } catch {}
  }
  return { files: listed, findings };
}

async function scanPackage(archive) {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-package-scan-'));
  try {
    const result = spawnSync('tar', ['-xzf', resolve(archive), '-C', root], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Unable to inspect npm package: ${result.stderr}`);
    return await scanDirectory(root, 'package');
  } finally { await rm(root, { recursive: true, force: true }); }
}

const packageIndex = process.argv.indexOf('--package');
const appIndex = process.argv.indexOf('--app');
let result;
if (packageIndex >= 0) result = await scanPackage(process.argv[packageIndex + 1]);
else if (appIndex >= 0) result = await scanDirectory(resolve(process.argv[appIndex + 1]), 'app');
else {
  try { result = await scanGit(process.cwd()); }
  catch { result = await scanDirectory(process.cwd(), 'no-git'); }
}
const unique = [...new Map(result.findings.map((item) => [`${item.file}:${item.source}:${item.rule}`, item])).values()];
console.log(JSON.stringify({ ok: unique.length === 0, scannedFiles: result.files.length, findings: unique }, null, 2));
if (unique.length) process.exitCode = 1;

export const privacyInternals = { CONTENT_RULES, PATH_RULES, scanDirectory, scanPackage };
