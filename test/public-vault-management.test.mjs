import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { copyVault, planVaultCopy, switchVault, vaultStatus, verifyVaultCopy } from '../scripts/lib/vault-management.mjs';

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
    await assert.rejects(() => copyVault(planPath, { confirmCopyOnly: false }), /confirm-copy-only/);
    const copied = await copyVault(planPath, { confirmCopyOnly: true });
    assert.equal(copied.deleted, 0);
    assert.equal(await readFile(join(source, 'core', 'example.md'), 'utf8'), '# User-owned local data\n');
    const receipt = await verifyVaultCopy(planPath);
    assert.equal(receipt.status, 'pass');
    await switchVault({ planPath, receipt, configFile });
    assert.equal(vaultStatus({ configFile }).memoryDir, target);
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
