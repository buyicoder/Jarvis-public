import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { isPathInside } from './path-boundary.mjs';

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function listFiles(root, current = root) {
  const result = [];
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Vault plans reject symlinks: ${path}`);
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else if (entry.isFile()) {
      const content = await readFile(path);
      result.push({ path: relative(root, path), bytes: content.byteLength, sha256: sha(content) });
    } else throw new Error(`Vault plans reject special files: ${path}`);
  }
  return result;
}

async function assertEmpty(path) {
  try {
    if ((await readdir(path)).length) throw new Error(`Target Vault must be empty: ${path}`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function planVaultCopy({ source, target, planPath }) {
  const sourceRoot = resolve(source);
  const targetRoot = resolve(target);
  if (sourceRoot === targetRoot || isPathInside(sourceRoot, targetRoot) || isPathInside(targetRoot, sourceRoot)) throw new Error('Source and target Vaults must be separate.');
  if (!(await stat(sourceRoot)).isDirectory()) throw new Error('Source Vault must be a directory.');
  await assertEmpty(targetRoot);
  const files = await listFiles(sourceRoot);
  const plan = {
    schema: 'jarvis-public-vault-copy/v1',
    planId: randomUUID(),
    mode: 'copy_only',
    source: sourceRoot,
    target: targetRoot,
    files,
    deletesSource: false,
    createdAt: new Date().toISOString(),
  };
  plan.planSha256 = sha(JSON.stringify(plan));
  await mkdir(dirname(planPath), { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return plan;
}

async function loadPlan(planPath) {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  if (plan.schema !== 'jarvis-public-vault-copy/v1' || plan.mode !== 'copy_only' || plan.deletesSource !== false) throw new Error('Unsafe Vault copy plan.');
  return plan;
}

async function verifySource(plan) {
  const current = await listFiles(plan.source);
  if (JSON.stringify(current) !== JSON.stringify(plan.files)) throw new Error('Vault source changed after plan creation.');
}

export async function copyVault(planPath, { confirmCopyOnly = false, dryRun = false } = {}) {
  if (!confirmCopyOnly) throw new Error('Vault copy requires --confirm-copy-only.');
  const plan = await loadPlan(planPath);
  await verifySource(plan);
  await assertEmpty(plan.target);
  if (!dryRun) {
    for (const file of plan.files) {
      const source = resolve(plan.source, file.path);
      const target = resolve(plan.target, file.path);
      if (!isPathInside(plan.source, source) || !isPathInside(plan.target, target)) throw new Error(`Unsafe Vault path: ${file.path}`);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }
  return { ok: true, dryRun, copied: plan.files.length, deleted: 0, source: plan.source, target: plan.target };
}

export async function verifyVaultCopy(planPath) {
  const plan = await loadPlan(planPath);
  await verifySource(plan);
  const targetFiles = await listFiles(plan.target);
  const status = JSON.stringify(targetFiles) === JSON.stringify(plan.files) ? 'pass' : 'fail';
  return { schema: 'jarvis-public-vault-verify/v1', status, planId: plan.planId, planSha256: plan.planSha256, target: plan.target, verifiedAt: new Date().toISOString() };
}

export async function switchVault({ planPath, receipt, configFile }) {
  const plan = await loadPlan(planPath);
  if (receipt?.status !== 'pass' || receipt.planId !== plan.planId || receipt.planSha256 !== plan.planSha256 || receipt.target !== plan.target) {
    throw new Error('Vault switch requires a matching PASS verification receipt.');
  }
  const targetFiles = await listFiles(plan.target);
  if (JSON.stringify(targetFiles) !== JSON.stringify(plan.files)) throw new Error('Target Vault changed after verification.');
  const config = existsSync(configFile) ? JSON.parse(await readFile(configFile, 'utf8')) : {};
  const updated = { ...config, verifiedVaultDir: plan.target, vaultReceipt: { planId: plan.planId, planSha256: plan.planSha256, verifiedAt: receipt.verifiedAt } };
  await mkdir(dirname(configFile), { recursive: true });
  const temporary = `${configFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  await rename(temporary, configFile);
  return { ok: true, memoryDir: plan.target };
}

export function vaultStatus({ configFile }) {
  if (!existsSync(configFile)) return { configured: false, memoryDir: '', verified: false };
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  return { configured: Boolean(config.verifiedVaultDir), memoryDir: config.verifiedVaultDir || '', verified: Boolean(config.vaultReceipt?.planSha256) };
}
