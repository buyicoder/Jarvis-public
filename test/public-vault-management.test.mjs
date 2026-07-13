import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { copyVault, planVaultCopy, switchVault, vaultStatus, verifyVaultCopy } from '../scripts/lib/vault-management.mjs';
import { canonicalPath } from '../scripts/lib/path-boundary.mjs';

test('Vault copy is reviewable, copy-only, verified and switchable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-vault-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'target');
    const planPath = join(root, 'runtime', 'copy-plan.json');
    const configFile = join(root, 'config.json');
    await mkdir(join(source, 'core'), { recursive: true });
    await writeFile(join(source, 'core', 'example.md'), '# User-owned local data\n');
    const plan = await planVaultCopy({ source, target, planPath });
    assert.equal(plan.files.length, 1);
    assert.equal((await stat(planPath)).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, 'runtime'))).mode & 0o777, 0o700);
    await assert.rejects(() => copyVault(planPath, { confirmCopyOnly: false }), /confirm-copy-only/);
    const copied = await copyVault(planPath, { confirmCopyOnly: true });
    assert.equal(copied.deleted, 0);
    assert.equal(await readFile(join(source, 'core', 'example.md'), 'utf8'), '# User-owned local data\n');
    const receipt = await verifyVaultCopy(planPath);
    assert.equal(receipt.status, 'pass');
    await switchVault({ planPath, receipt, configFile });
    assert.equal(vaultStatus({ configFile }).memoryDir, canonicalPath(target));
    assert.equal((await stat(configFile)).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Vault copy rejects non-empty targets and changed sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-vault-reject-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'target');
    const planPath = join(root, 'plan.json');
    await mkdir(source, { recursive: true });
    await mkdir(target, { recursive: true });
    await writeFile(join(source, 'a.md'), 'one');
    await writeFile(join(target, 'existing.md'), 'occupied');
    await assert.rejects(() => planVaultCopy({ source, target, planPath }), /empty/);
    await rm(join(target, 'existing.md'));
    await planVaultCopy({ source, target, planPath });
    await writeFile(join(source, 'a.md'), 'changed');
    await assert.rejects(() => copyVault(planPath, { confirmCopyOnly: true }), /source changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Vault switch rejects a target changed after its PASS receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-vault-stale-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'target');
    const planPath = join(root, 'plan.json');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'note.md'), 'original');
    await planVaultCopy({ source, target, planPath });
    await copyVault(planPath, { confirmCopyOnly: true });
    const receipt = await verifyVaultCopy(planPath);
    await writeFile(join(target, 'note.md'), 'tampered');
    await assert.rejects(switchVault({ planPath, receipt, configFile: join(root, 'config.json') }), /changed after verification/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Vault plan and copy reject symlink roots and revalidate roots before switch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-vault-symlink-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'target');
    const outside = join(root, 'outside');
    const planPath = join(root, 'runtime', 'plan.json');
    await Promise.all([mkdir(source), mkdir(outside)]);
    await writeFile(join(source, 'private.md'), 'private');
    await symlink(outside, target);
    await assert.rejects(planVaultCopy({ source, target, planPath }), /reject symlinks/i);
    await rm(target);
    await planVaultCopy({ source, target, planPath });
    await copyVault(planPath, { confirmCopyOnly: true });
    const receipt = await verifyVaultCopy(planPath);
    await rename(target, join(root, 'verified-target'));
    await symlink(outside, target);
    await assert.rejects(switchVault({ planPath, receipt, configFile: join(root, 'config.json') }), /reject symlinks|canonical/i);
    await assert.rejects(readFile(join(outside, 'private.md')), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Vault plans preserve existing parent modes and reject tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-vault-integrity-'));
  try {
    const source = join(root, 'source');
    const output = join(root, 'shared-output');
    const planPath = join(output, 'plan.json');
    await Promise.all([mkdir(source), mkdir(output, { mode: 0o755 })]);
    await chmod(output, 0o755);
    await writeFile(join(source, 'note.md'), 'reviewed');
    await planVaultCopy({ source, target: join(root, 'target'), planPath });
    assert.equal((await stat(output)).mode & 0o777, 0o755);
    const plan = JSON.parse(await readFile(planPath, 'utf8'));
    plan.files[0].sha256 = '0'.repeat(64);
    await writeFile(planPath, JSON.stringify(plan));
    await assert.rejects(copyVault(planPath, { confirmCopyOnly: true, dryRun: true }), /integrity/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
