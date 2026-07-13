#!/usr/bin/env node
import { constants, existsSync } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG } from '../scripts/lib/config.mjs';
import { readMarkdown } from '../scripts/lib/knowledge-base.mjs';
import { applyProposal, approveProposal, capture, createProposal, latestProposal, localDate } from '../scripts/lib/lifecycle.mjs';
import { auditTokenTelemetry, evaluateRoutingFixtures, explainRoute, recommendRoute, routeTask, writeShadowObservation } from '../scripts/lib/model-governor.mjs';
import { backupControlDb, controlDoctor, finalizeFeedback, readWarRoom, reconcileControlPlane, restoreControlDb, writeControlEvent } from '../scripts/lib/control-plane.mjs';
import { classifyCodexAvailability, dispatchDecision, ingestReport, reconcileRoster, validateOnboarding, validatePermissionRequest } from '../scripts/lib/governance.mjs';
import { copyVault, planVaultCopy, switchVault, vaultStatus, verifyVaultCopy } from '../scripts/lib/vault-management.mjs';
import { collectActivity, routeAutomation, writeDailyEvidence } from '../scripts/lib/activity-automation.mjs';
import { providerStatus, runProviderDistill } from '../scripts/lib/provider.mjs';

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
  await mkdir(CONFIG.runtimeDir, { recursive: true });
  return { initialized: true, memoryDir: CONFIG.memoryDir, runtimeDir: CONFIG.runtimeDir, repoMemory: CONFIG.isLegacyRepoMemory };
}

function codexStatus() {
  if (!CONFIG.codexAdapterEnabled) return { available: false, reason: 'not_configured', guidance: 'Set JARVIS_CODEX_ADAPTER=1 and an explicit state path to opt in.' };
  const binary = spawnSync('codex', ['--version'], { stdio: 'ignore' }).status === 0;
  return classifyCodexAvailability({ binary, statePath: CONFIG.codexStatePath, stateReadable: Boolean(CONFIG.codexStatePath && existsSync(CONFIG.codexStatePath)) });
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
  } catch { checks.push({ name: 'vault_read_write', ok: false, fix: 'run jarvis init and verify Vault permissions' }); }
  checks.push({ name: 'provider_optional', ok: true, detail: providerStatus(CONFIG).status });
  checks.push({ name: 'activity_opt_in', ok: true, detail: CONFIG.activityOptIn ? 'enabled' : 'disabled' });
  checks.push({ name: 'codex_optional', ok: true, detail: codexStatus().reason });
  return { ok: checks.every((check) => check.ok), checks };
}

async function morning() {
  const date = localDate();
  const dir = join(CONFIG.dailyDir, date.slice(0, 4), date.slice(5, 7));
  let files = [];
  try { files = (await readdir(dir)).filter((file) => file.endsWith('.md')).sort().reverse().slice(0, 3); } catch {}
  return { date, priorityQuestion: 'Which action most reduces delivery risk today?', recentDaily: files };
}

async function evening() {
  const date = localDate();
  const dir = join(CONFIG.capturesDir, date.slice(0, 4), date.slice(5, 7));
  let captures = [];
  try { captures = (await readdir(dir)).filter((file) => file.endsWith('.md')); } catch {}
  return { date, completedEvidence: captures.length, writes: false, tomorrow: ['Choose the highest-risk deliverable', 'Review pending proposals', 'Preserve one reusable lesson'] };
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
  if (flag('--provider')) return runProviderDistill({ text: items.map((item) => item.content).join('\n'), config: CONFIG });
  if (!flag('--write-proposal')) return { date, captures: items.length, classification: items.length ? 'review_for_reuse' : 'no_input', writes: false };
  return createProposal({ proposalsDir: CONFIG.proposalsDir, items });
}

async function controlCommand() {
  const action = args[0] || 'doctor';
  if (action === 'reconcile') return reconcileControlPlane(CONFIG);
  if (action === 'doctor') return controlDoctor(CONFIG);
  if (action === 'event') return writeControlEvent(CONFIG, { eventId: value('--event-id'), projectId: value('--project'), taskId: value('--task'), type: value('--type', 'task'), status: value('--status', 'active'), summary: value('--summary') });
  if (action === 'backup') return { ok: true, path: await backupControlDb(CONFIG, value('--output')) };
  if (action === 'restore') return { ok: true, path: await restoreControlDb(CONFIG, value('--input')) };
  throw new Error(`Unknown control action: ${action}`);
}

async function vaultCommand() {
  const action = args[0] || 'status';
  const planPath = value('--plan', join(CONFIG.runtimeDir, 'vault-copy-plan.json'));
  if (action === 'status') return vaultStatus({ configFile: CONFIG.userConfigFile });
  if (action === 'plan') return planVaultCopy({ source: value('--source'), target: value('--target'), planPath });
  if (action === 'copy') return copyVault(planPath, { confirmCopyOnly: flag('--confirm-copy-only'), dryRun: flag('--dry-run') });
  if (action === 'verify') return verifyVaultCopy(planPath);
  if (action === 'switch') {
    const receipt = JSON.parse(await readFile(value('--receipt'), 'utf8'));
    return switchVault({ planPath, receipt, configFile: CONFIG.userConfigFile });
  }
  throw new Error(`Unknown vault action: ${action}`);
}

async function threadsCommand() {
  const action = args[0] || 'codex-status';
  if (action === 'codex-status') return codexStatus();
  if (action === 'onboarding') return validateOnboarding({ title: value('--title'), permissionProfile: value('--permission-profile'), approvalPolicy: value('--approval-policy'), archived: flag('--archived') }, { expectedTitle: value('--expected-title') });
  if (action === 'dispatch') return dispatchDecision({ actorRole: value('--actor-role'), taskKind: value('--task-kind', 'project'), projectId: value('--project'), targetRole: value('--target-role') });
  if (action === 'reconcile-roster') return reconcileRoster([], JSON.parse(value('--roster-json', '[]')));
  throw new Error(`Unknown threads action: ${action}`);
}

async function reportsCommand() {
  const action = args[0];
  if (action === 'ingest') return ingestReport(value('--path'), { reportsDir: CONFIG.reportsDir, maxBytes: Number(value('--max-bytes', 1024 * 1024)) });
  if (action === 'finalize-feedback') return finalizeFeedback(CONFIG, value('--path'), { target: value('--target'), receipt: value('--receipt') });
  throw new Error(`Unknown reports action: ${action}`);
}

async function modelCommand() {
  const action = args[0] || 'route';
  const input = { complexity: value('--complexity', 1), risk: value('--risk', 'low'), budget: value('--budget', 'normal'), taskType: value('--task-type', 'general'), requestedEffort: value('--requested-effort'), maxRequested: flag('--max'), priorFailedAttempts: value('--prior-failed-attempts', 0), irreversible: flag('--irreversible'), blastRadius: value('--blast-radius'), requiresSecurityJudgment: flag('--security-judgment'), requiresReleaseJudgment: flag('--release-judgment'), maxReason: value('--max-reason'), tokenBudget: value('--token-budget', 0), stopCondition: value('--stop-condition') };
  const route = routeTask(input);
  if (action === 'route') {
    if (flag('--shadow')) await writeShadowObservation(join(CONFIG.runtimeDir, 'model-governor', 'shadow.jsonl'), { taskId: value('--task-id'), projectId: value('--project'), route });
    return route;
  }
  if (action === 'explain') return explainRoute(route);
  if (action === 'evaluate') return evaluateRoutingFixtures([]);
  throw new Error(`Unknown models action: ${action}`);
}

async function activityCommand() {
  const activity = await collectActivity(CONFIG);
  if (args[0] === 'status') return activity;
  if (args[0] === 'scan') {
    if (!flag('--write')) return { ...activity, writes: false };
    return { ...activity, writes: true, evidence: await writeDailyEvidence({ memoryDir: CONFIG.memoryDir, activity }) };
  }
  throw new Error(`Unknown activity action: ${args[0]}`);
}

async function run() {
  if (command === 'init') return init();
  if (command === 'doctor') return flag('--control-plane') ? controlDoctor(CONFIG) : doctor();
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
  if (command === 'evening') return evening();
  if (command === 'distill') return distill();
  if (command === 'route') return recommendRoute({ complexity: value('--complexity', 1), risk: value('--risk', 'low'), budget: value('--budget', 'normal') });
  if (command === 'models') return modelCommand();
  if (command === 'tokens') return auditTokenTelemetry(args.slice(1).filter((item) => !item.startsWith('--')));
  if (command === 'control') return controlCommand();
  if (command === 'war-room') return readWarRoom(CONFIG, value('--project'));
  if (command === 'vault') return vaultCommand();
  if (command === 'threads') return threadsCommand();
  if (command === 'permissions') return validatePermissionRequest({ action: value('--action'), targetPaths: value('--paths').split(',').filter(Boolean), projectRoot: value('--project-root', process.cwd()) });
  if (command === 'reports') return reportsCommand();
  if (command === 'provider' && args[0] === 'status') return providerStatus(CONFIG);
  if (command === 'activity') return activityCommand();
  if (command === 'automation') return routeAutomation({ projectId: value('--project'), roster: JSON.parse(value('--roster-json', '[]')) });
  if (command === 'search') {
    const query = positionals().join(' ');
    if (!existsSync(CONFIG.vectorDbDir)) return { query, results: [], status: 'empty_index' };
    const { search } = await import('../scripts/lib/vector-store.mjs');
    return { query, results: await search(query) };
  }
  if (command === 'radar') {
    const { runResearchRadar } = await import('../scripts/lib/research-radar.mjs');
    return runResearchRadar({ scansDir: CONFIG.scansDir, network: args.includes('--network') });
  }
  if (command === 'help') return { commands: ['init', 'doctor [--control-plane]', 'capture', 'distill [--provider|--write-proposal]', 'proposal create|preview|approve', 'apply [--yes]', 'morning', 'evening', 'route', 'models route|explain|evaluate', 'tokens audit [jsonl...]', 'vault status|plan|copy|verify|switch', 'control reconcile|doctor|event|backup|restore', 'war-room', 'threads codex-status|onboarding|dispatch|reconcile-roster', 'permissions', 'reports ingest|finalize-feedback', 'activity status|scan', 'automation', 'search', 'radar [--network]'] };
  throw new Error(`Unknown command: ${command}`);
}

try { console.log(JSON.stringify(await run(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
