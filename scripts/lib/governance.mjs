import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isPathInsideCanonical } from './path-boundary.mjs';

export function classifyCodexAvailability({ binary = false, statePath = '', stateReadable = undefined } = {}) {
  const guidance = 'Install/configure a Codex adapter only if thread integration is desired.';
  if (!binary) return { available: false, reason: 'binary_missing', guidance };
  if (!statePath || stateReadable !== true) return { available: false, reason: 'state_unavailable', guidance };
  return { available: true, reason: 'available', guidance: '' };
}

function promptLike(title) {
  return title.length > 80 || /(?:please|execute|implement|task:|请执行|完成后|要求[:：])/i.test(title);
}

export function validateOnboarding(actual = {}, expected = {}) {
  const reasons = [];
  if (!actual.title) reasons.push('empty_title');
  else if (promptLike(actual.title)) reasons.push('prompt_like_title');
  if (expected.expectedTitle && actual.title !== expected.expectedTitle) reasons.push('title_mismatch');
  if (actual.permissionProfile !== 'danger-full-access') reasons.push('permission_profile');
  if (actual.approvalPolicy !== 'never') reasons.push('approval_policy');
  if (actual.archived === true || actual.retired === true) reasons.push('retired_or_archived');
  return { ok: reasons.length === 0, reasons };
}

export function dispatchDecision(input = {}) {
  if (!input.projectId) return { decision: 'PROJECT_CONTEXT_MISSING', shouldMainExecute: false };
  if (input.actorRole === 'main' && input.taskKind === 'project') {
    return { decision: 'ROUTE_TO_PROJECT_OWNER', shouldMainExecute: false, nextRole: input.targetRole || 'project-owner' };
  }
  if (input.actorRole === 'project-owner' && input.taskKind === 'project') {
    return { decision: 'READY_FOR_PROJECT_OWNER', shouldMainExecute: false, nextRole: 'project-owner' };
  }
  return { decision: 'READY', shouldMainExecute: input.actorRole !== 'main' };
}

function rosterKey(value) {
  return `${value.projectId}:${value.roleId}:${value.assigneeId}`;
}

export function reconcileRoster(existing = [], incoming = []) {
  const protectedAssignments = new Map(existing.filter((item) => item.immutable || item.roleId === 'jarvis-root').map((item) => [`${item.projectId}:${item.roleId}`, item]));
  const result = new Map(existing.map((item) => [rosterKey(item), { ...item }]));
  for (const value of incoming) {
    if (!value.projectId || !value.roleId || !value.assigneeId) continue;
    const protectedValue = protectedAssignments.get(`${value.projectId}:${value.roleId}`);
    if (protectedValue && protectedValue.assigneeId !== value.assigneeId) continue;
    result.set(rosterKey(value), { ...value, immutable: value.immutable === true || value.roleId === 'jarvis-root' });
  }
  return [...result.values()].sort((a, b) => rosterKey(a).localeCompare(rosterKey(b)));
}

export function validatePermissionRequest(request = {}) {
  if (['production_deploy', 'external_publish', 'destructive_delete', 'credential_access'].includes(request.action)) {
    return { decision: 'needs_user_confirmation', reason: 'high_impact_action' };
  }
  const paths = request.targetPaths || [];
  const allowed = paths.every((path) => isPathInsideCanonical(request.projectRoot || '.', path) || isPathInsideCanonical('/tmp', path));
  return allowed
    ? { decision: 'auto_allow', reason: 'task_scoped_local_action' }
    : { decision: 'deny', reason: 'path_outside_project_boundary' };
}

export function lifecycleStatus(value = {}) {
  if (value.supersededBy || value.status === 'superseded') return 'superseded';
  if (value.resolvedAt || ['resolved', 'retired', 'rejected', 'applied'].includes(value.status)) return 'resolved';
  return 'current';
}

export async function ingestReport(reportPath, { reportsDir, maxBytes = 1024 * 1024 } = {}) {
  const content = await readFile(reportPath);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const bytes = content.byteLength;
  if (bytes > maxBytes) return { mode: 'reference', sha256, bytes, uri: `storage://sha256/${sha256}`, source: reportPath };
  const target = resolve(reportsDir || 'runtime/reports', 'durable', `${sha256}.md`);
  await mkdir(dirname(target), { recursive: true });
  try { await access(target); } catch { await copyFile(reportPath, target); }
  return { mode: 'copied', sha256, bytes, uri: `file://${target}`, path: target };
}

export async function inspectAdapterState(path) {
  try {
    const info = await stat(path);
    return { readable: info.isFile(), path };
  } catch (error) {
    return { readable: false, path, reason: error.code === 'ENOENT' ? 'state_unavailable' : 'state_unreadable' };
  }
}
