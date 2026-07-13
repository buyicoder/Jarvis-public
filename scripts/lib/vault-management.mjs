import { createHash, randomUUID } from 'node:crypto';
import { constants, existsSync, readFileSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { canonicalPath, isPathInsideCanonical } from './path-boundary.mjs';

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

async function assertNoSymlinkComponents(path) {
  const absolute = resolve(path);
  const parts = absolute.split('/').filter(Boolean);
  let current = absolute.startsWith('/') ? '/' : '';
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        const systemAlias = process.platform === 'darwin' && ['/etc', '/tmp', '/var'].includes(current);
        if (!systemAlias) throw new Error(`Vault paths reject symlinks: ${current}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function validatePlanRoots(plan) {
  await assertNoSymlinkComponents(plan.source);
  await assertNoSymlinkComponents(plan.target);
  const source = canonicalPath(plan.source);
  const target = canonicalPath(plan.target);
  if (source !== plan.source || target !== plan.target) throw new Error('Vault plan roots must remain canonical.');
  if (source === target || isPathInsideCanonical(source, target) || isPathInsideCanonical(target, source)) {
    throw new Error('Source and target Vaults must be separate.');
  }
  return { source, target };
}

async function secureDirectory(path) {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    await chmod(path, 0o700);
  }
}

export async function planVaultCopy({ source, target, planPath }) {
  await assertNoSymlinkComponents(source);
  await assertNoSymlinkComponents(target);
  const sourceRoot = canonicalPath(source);
  const targetRoot = canonicalPath(target);
  if (sourceRoot === targetRoot || isPathInsideCanonical(sourceRoot, targetRoot) || isPathInsideCanonical(targetRoot, sourceRoot)) throw new Error('Source and target Vaults must be separate.');
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
  await secureDirectory(dirname(planPath));
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(planPath, 0o600);
  return plan;
}

async function loadPlan(planPath) {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  if (plan.schema !== 'jarvis-public-vault-copy/v1' || plan.mode !== 'copy_only' || plan.deletesSource !== false) throw new Error('Unsafe Vault copy plan.');
  const { planSha256, ...unsignedPlan } = plan;
  if (!planSha256 || planSha256 !== sha(JSON.stringify(unsignedPlan))) throw new Error('Vault copy plan integrity check failed.');
  await validatePlanRoots(plan);
  return plan;
}

async function verifySource(plan) {
  if (!await vaultMatchesPlan(plan, plan.source)) throw new Error('Vault source changed after plan creation.');
}

async function vaultMatchesPlan(plan, root) {
  return JSON.stringify(await listFiles(root)) === JSON.stringify(plan.files);
}

export async function copyVault(planPath, { confirmCopyOnly = false, dryRun = false } = {}) {
  if (!confirmCopyOnly) throw new Error('Vault copy requires --confirm-copy-only.');
  const plan = await loadPlan(planPath);
  await verifySource(plan);
  await assertEmpty(plan.target);
  if (!dryRun) {
    await secureDirectory(plan.target);
    for (const file of plan.files) {
      const source = resolve(plan.source, file.path);
      const target = resolve(plan.target, file.path);
      if (!isPathInsideCanonical(plan.source, source) || !isPathInsideCanonical(plan.target, target)) throw new Error(`Unsafe Vault path: ${file.path}`);
      await assertNoSymlinkComponents(source);
      await assertNoSymlinkComponents(dirname(target));
      await secureDirectory(dirname(target));
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await chmod(target, 0o600);
    }
    await validatePlanRoots(plan);
    if (!await vaultMatchesPlan(plan, plan.target)) throw new Error('Target Vault does not match the reviewed copy plan.');
  }
  return { ok: true, dryRun, copied: plan.files.length, deleted: 0, source: plan.source, target: plan.target };
}

export async function verifyVaultCopy(planPath) {
  const plan = await loadPlan(planPath);
  await verifySource(plan);
  const status = await vaultMatchesPlan(plan, plan.target) ? 'pass' : 'fail';
  return { schema: 'jarvis-public-vault-verify/v1', status, planId: plan.planId, planSha256: plan.planSha256, target: plan.target, verifiedAt: new Date().toISOString() };
}

export async function switchVault({ planPath, receipt, configFile }) {
  const plan = await loadPlan(planPath);
  if (receipt?.status !== 'pass' || receipt.planId !== plan.planId || receipt.planSha256 !== plan.planSha256 || receipt.target !== plan.target) {
    throw new Error('Vault switch requires a matching PASS verification receipt.');
  }
  if (!await vaultMatchesPlan(plan, plan.target)) throw new Error('Target Vault changed after verification.');
  const config = existsSync(configFile) ? JSON.parse(await readFile(configFile, 'utf8')) : {};
  const updated = { ...config, verifiedVaultDir: plan.target, vaultReceipt: { planId: plan.planId, planSha256: plan.planSha256, verifiedAt: receipt.verifiedAt } };
  await secureDirectory(dirname(configFile));
  const temporary = `${configFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, configFile);
  await chmod(configFile, 0o600);
  return { ok: true, memoryDir: plan.target };
}

export function vaultStatus({ configFile }) {
  if (!existsSync(configFile)) return { configured: false, memoryDir: '', verified: false };
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  return { configured: Boolean(config.verifiedVaultDir), memoryDir: config.verifiedVaultDir || '', verified: Boolean(config.vaultReceipt?.planSha256) };
}
