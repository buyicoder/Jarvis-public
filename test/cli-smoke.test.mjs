import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/jarvis.mjs', import.meta.url));
function run(args, vault, extra = {}) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: vault, ...extra } }));
}

test('clean offline lifecycle works end to end in an external Vault', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'jarvis-cli-'));
  assert.equal(run(['init'], vault).repoMemory, false);
  assert.equal(run(['doctor'], vault).ok, true);
  run(['capture', 'A', 'reviewable', 'lesson', '--type', 'learning'], vault);
  assert.equal(run(['distill'], vault).writes, false);
  assert.equal(run(['distill', '--write-proposal'], vault).proposal.status, 'proposed');
  assert.equal(run(['apply'], vault).previewOnly, true);
  assert.equal(run(['proposal', 'approve'], vault).proposal.status, 'approved');
  assert.equal(run(['apply', '--yes'], vault).applied, 1);
  const date = new Date();
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  assert.match(await readFile(join(vault, 'daily', day.slice(0, 4), day.slice(5, 7), `${day}.md`), 'utf8'), /reviewable lesson/);
});

test('capture preserves text equal to the type option value', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'jarvis-argv-'));
  run(['init'], vault);
  const result = run(['capture', 'learning', 'note', '--type', 'learning'], vault);
  assert.match(await readFile(result.path, 'utf8'), /learning note/);
});

test('explicit legacy mode remains available without changing the default', () => {
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'doctor'], {
    encoding: 'utf8',
    env: { ...process.env, JARVIS_VAULT_DIR: '', JARVIS_MEMORY_DIR: '', JARVIS_LEGACY_REPO_MEMORY: '1' },
  }));
  assert.equal(result.checks[0].mode, 'explicit_legacy');
});

test('Stop hook writes to the configured Vault under ESM', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'jarvis-hook-'));
  execFileSync(process.execPath, [fileURLToPath(new URL('../.claude/hooks/stop.js', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: vault, CLAUDE_CODE_PROJECT_DIR: join(vault, 'sample-project') },
  });
  const date = new Date();
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  assert.match(await readFile(join(vault, 'daily', day.slice(0, 4), day.slice(5, 7), `${day}.md`), 'utf8'), /sample-project/);
});

test('repository-local Vault requires explicit legacy mode', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [cli, 'doctor'], {
    encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: join(repoRoot, 'memory'), JARVIS_LEGACY_REPO_MEMORY: '0' },
  }), /Command failed/);
});

test('repository-local Vault rejects a missing child through a symlinked ancestor', async () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'jarvis-repo-link-'));
  const link = join(root, 'repo-link');
  await symlink(repoRoot, link);
  assert.throws(() => execFileSync(process.execPath, [cli, 'doctor'], {
    encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: join(link, 'new-vault'), JARVIS_LEGACY_REPO_MEMORY: '0' },
  }), /Command failed/);
});

test('invalid command and route input exit nonzero', () => {
  const vault = join(tmpdir(), 'jarvis-invalid-vault');
  assert.throws(() => execFileSync(process.execPath, [cli, 'unknown'], { encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: vault } }));
  assert.throws(() => execFileSync(process.execPath, [cli, 'route', '--complexity', 'nope'], { encoding: 'utf8', env: { ...process.env, JARVIS_VAULT_DIR: vault } }));
});
