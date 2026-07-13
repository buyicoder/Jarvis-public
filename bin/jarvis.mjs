#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, cp, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFIG } from '../scripts/lib/config.mjs';
import { readMarkdown } from '../scripts/lib/knowledge-base.mjs';
import { applyProposal, approveProposal, capture, createProposal, latestProposal, localDate } from '../scripts/lib/lifecycle.mjs';
import { recommendRoute } from '../scripts/lib/model-governor.mjs';

const [command = 'help', ...args] = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback = '') => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
function positionals(excludedOptions = new Set()) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) {
    if (excludedOptions.has(args[index])) { index += 1; continue; }
    if (!args[index].startsWith('--')) result.push(args[index]);
  }
  return result;
}

async function init() {
  const dirs = ['core/projects', 'daily', 'captures', 'proposals', 'archive', 'conversations', 'scans', '_schemas'];
  await Promise.all(dirs.map((dir) => mkdir(join(CONFIG.memoryDir, dir), { recursive: true })));
  for (const file of await readdir(CONFIG.schemasDir)) {
    if (/\.(?:md|json)$/.test(file)) await cp(join(CONFIG.schemasDir, file), join(CONFIG.memoryDir, '_schemas', file), { force: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  }
  return { initialized: true, memoryDir: CONFIG.memoryDir, repoMemory: CONFIG.isLegacyRepoMemory };
}

async function doctor() {
  const checks = [];
  checks.push({ name: 'memory_boundary', ok: true, detail: CONFIG.memoryDir, mode: CONFIG.isLegacyRepoMemory ? 'explicit_legacy' : 'external_vault' });
  try {
    await access(CONFIG.memoryDir, constants.R_OK | constants.W_OK);
    const probe = join(CONFIG.memoryDir, `.doctor-${process.pid}`);
    await writeFile(probe, 'ok', { flag: 'wx' });
    await unlink(probe);
    checks.push({ name: 'vault_read_write', ok: true });
  } catch {
    checks.push({ name: 'vault_read_write', ok: false, fix: 'run jarvis init and verify Vault permissions' });
  }
  checks.push({ name: 'no_api_key_required', ok: true });
  return { ok: checks.every((check) => check.ok), checks };
}

async function morning() {
  const date = localDate();
  const dir = join(CONFIG.dailyDir, date.slice(0, 4), date.slice(5, 7));
  let files = [];
  try { files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort().reverse().slice(0, 3); } catch {}
  return { date, priorityQuestion: 'Which action most reduces delivery risk today?', recentDaily: files };
}

async function distill() {
  const date = localDate();
  const dir = join(CONFIG.capturesDir, date.slice(0, 4), date.slice(5, 7));
  let files = [];
  try { files = (await readdir(dir)).filter((file) => file.startsWith(date) && file.endsWith('.md')).sort(); } catch {}
  const items = files.map((file) => {
    const body = readMarkdown(join(dir, file))?.content.trim() || '';
    return body ? { target: `memory/daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`, mode: 'append', heading: 'Captured input', content: body } : null;
  }).filter(Boolean);
  if (!flag('--write-proposal')) return { date, captures: items.length, classification: items.length ? 'review_for_reuse' : 'no_input', writes: false };
  return createProposal({ proposalsDir: CONFIG.proposalsDir, items });
}

async function run() {
  if (command === 'init') return init();
  if (command === 'doctor') return doctor();
  if (command === 'capture') return { path: await capture(positionals(new Set(['--type'])).join(' '), { capturesDir: CONFIG.capturesDir, type: value('--type', 'note') }) };
  if (command === 'proposal') {
    const action = args[0] || 'preview';
    if (!['create', 'preview', 'approve'].includes(action)) throw new Error(`Unknown proposal action: ${action}`);
    const record = await latestProposal(CONFIG.proposalsDir);
    if (action === 'create') return createProposal({ proposalsDir: CONFIG.proposalsDir, items: [{ target: value('--target'), mode: 'append', heading: value('--heading'), content: value('--content') }] });
    if (action === 'approve') return approveProposal(record);
    return record || { status: 'none' };
  }
  if (command === 'apply') {
    const record = await latestProposal(CONFIG.proposalsDir);
    if (!flag('--yes')) return { previewOnly: true, proposal: record?.proposal || null, instruction: 'Run jarvis apply --yes after approval.' };
    return { applied: await applyProposal(record, { memoryDir: CONFIG.memoryDir }) };
  }
  if (command === 'morning') return morning();
  if (command === 'distill') return distill();
  if (command === 'route') return recommendRoute({ complexity: value('--complexity', 1), risk: value('--risk', 'low'), budget: value('--budget', 'normal') });
  if (command === 'help') return { commands: ['init', 'doctor', 'capture', 'distill [--write-proposal]', 'proposal create|preview|approve', 'apply [--yes]', 'morning', 'route'] };
  throw new Error(`Unknown command: ${command}`);
}

try { console.log(JSON.stringify(await run(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
