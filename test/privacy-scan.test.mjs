import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scanner = fileURLToPath(new URL('../scripts/privacy-scan.mjs', import.meta.url));
const packageBoundary = fileURLToPath(new URL('../scripts/lib/package-privacy.mjs', import.meta.url));

test('privacy scan reads staged blobs and rejects non-schema memory and quoted secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-privacy-'));
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await mkdir(join(root, 'memory'), { recursive: true });
  await copyFile(scanner, join(root, 'scripts/privacy-scan.mjs'));
  await copyFile(packageBoundary, join(root, 'scripts/lib/package-privacy.mjs'));
  await writeFile(join(root, 'memory/identity.md'), 'owner: Example Person\n');
  const secretPayload = JSON.stringify({ [`access_${'token'}`]: 'secret-value', ['coo' + 'kie']: 'session-value' });
  await writeFile(join(root, 'leak.json'), `${secretPayload}\n`);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'scripts/privacy-scan.mjs', 'scripts/lib/package-privacy.mjs', 'memory/identity.md', 'leak.json'], { cwd: root });
  await writeFile(join(root, 'leak.json'), '{}\n');
  const result = spawnSync(process.execPath, ['scripts/privacy-scan.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /index/);
  assert.match(result.stdout, /non-schema-memory/);
});

test('app scan does not skip nested directories named index', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-privacy-index-'));
  await mkdir(join(root, 'docs/index'), { recursive: true });
  await writeFile(join(root, 'docs/index/leak.md'), JSON.stringify({ [`access_${'token'}`]: 'secret-value-123456789' }));
  const result = spawnSync(process.execPath, [scanner, '--app', root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /docs\/index\/leak\.md/);
});

test('git scan fails closed when a staged blob cannot be read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-privacy-unreadable-'));
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await copyFile(scanner, join(root, 'scripts/privacy-scan.mjs'));
  await copyFile(packageBoundary, join(root, 'scripts/lib/package-privacy.mjs'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  await writeFile(join(root, 'large.txt'), JSON.stringify({ [`access_${'token'}`]: 'secret-value-123456789' }) + 'x'.repeat(31 * 1024 * 1024));
  execFileSync('git', ['add', '.'], { cwd: root });
  await writeFile(join(root, 'large.txt'), 'safe');
  const result = spawnSync(process.execPath, ['scripts/privacy-scan.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /assigned-secret|index-unreadable/);
});

test('privacy scanner scans its own executable content outside rule definitions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-privacy-self-'));
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(scanner, 'utf8'));
  const injected = `access_${'token'}="secret-value-123456789"`;
  await writeFile(join(root, 'scripts/privacy-scan.mjs'), `${source}\n// ${injected}\n`);
  await copyFile(packageBoundary, join(root, 'scripts/lib/package-privacy.mjs'));
  const result = spawnSync(process.execPath, [join(root, 'scripts/privacy-scan.mjs'), '--app', root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /assigned-secret/);
});
