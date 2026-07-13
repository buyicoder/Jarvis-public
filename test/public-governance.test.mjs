import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  classifyCodexAvailability,
  dispatchDecision,
  ingestReport,
  reconcileRoster,
  validateOnboarding,
  validatePermissionRequest,
} from '../scripts/lib/governance.mjs';

test('Codex integration is optional and unavailable state is controlled', () => {
  assert.deepEqual(classifyCodexAvailability({ binary: false, statePath: '' }), {
    available: false,
    reason: 'binary_missing',
    guidance: 'Install/configure a Codex adapter only if thread integration is desired.',
  });
  assert.equal(classifyCodexAvailability({ binary: true, statePath: '/missing' }).reason, 'state_unavailable');
});

test('onboarding and dispatch preserve execution boundaries', () => {
  assert.equal(validateOnboarding({ title: '', permissionProfile: 'danger-full-access', approvalPolicy: 'never' }, { expectedTitle: 'Project owner' }).ok, false);
  assert.equal(validateOnboarding({ title: 'Project owner', permissionProfile: 'danger-full-access', approvalPolicy: 'never' }, { expectedTitle: 'Project owner' }).ok, true);
  assert.equal(dispatchDecision({ actorRole: 'main', taskKind: 'project', projectId: 'demo', targetRole: 'project-owner' }).decision, 'ROUTE_TO_PROJECT_OWNER');
  assert.equal(dispatchDecision({ actorRole: 'project-owner', taskKind: 'project', projectId: 'demo', targetRole: 'project-owner' }).decision, 'READY_FOR_PROJECT_OWNER');
  assert.equal(dispatchDecision({ actorRole: 'main', taskKind: 'project', projectId: 'demo', targetRole: 'project-owner' }).shouldMainExecute, false);
});

test('roster reconciliation is idempotent and immutable root cannot be reassigned', () => {
  const initial = [{ projectId: 'jarvis', roleId: 'jarvis-root', assigneeId: 'root', immutable: true, status: 'active' }];
  const reconciled = reconcileRoster(initial, [
    { projectId: 'jarvis', roleId: 'jarvis-root', assigneeId: 'attacker', status: 'active' },
    { projectId: 'demo', roleId: 'owner', assigneeId: 'owner-1', status: 'active' },
    { projectId: 'demo', roleId: 'owner', assigneeId: 'owner-1', status: 'active' },
  ]);
  assert.equal(reconciled.find((item) => item.roleId === 'jarvis-root').assigneeId, 'root');
  assert.equal(reconciled.filter((item) => item.projectId === 'demo').length, 1);
  assert.deepEqual(reconcileRoster(reconciled, reconciled), reconciled);
});

test('permission broker contains writes to declared project and tmp boundaries', () => {
  const projectRoot = '/workspace/demo';
  assert.equal(validatePermissionRequest({ action: 'write', targetPaths: ['/workspace/demo/src/a.mjs'], projectRoot }).decision, 'auto_allow');
  assert.equal(validatePermissionRequest({ action: 'write', targetPaths: ['/tmp/demo-report.md'], projectRoot }).decision, 'auto_allow');
  assert.equal(validatePermissionRequest({ action: 'write', targetPaths: ['/workspace/other/secret'], projectRoot }).decision, 'deny');
  assert.equal(validatePermissionRequest({ action: 'production_deploy', targetPaths: [], projectRoot }).decision, 'needs_user_confirmation');
});

test('permission broker rejects symlink traversal outside the project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-permission-'));
  try {
    const project = join(root, 'project');
    const outside = join(root, 'outside');
    await Promise.all([mkdir(project), mkdir(outside)]);
    await symlink(outside, join(project, 'link'));
    assert.equal(validatePermissionRequest({ action: 'write', targetPaths: [join(project, 'link', 'secret.md')], projectRoot: project }).decision, 'deny');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('durable report ingest hashes content and stores large evidence by reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-report-'));
  try {
    const small = join(root, 'small.md');
    const large = join(root, 'large.md');
    await writeFile(small, '# small\n');
    await writeFile(large, 'x'.repeat(256));
    const copied = await ingestReport(small, { reportsDir: join(root, 'reports'), maxBytes: 64 });
    const referenced = await ingestReport(large, { reportsDir: join(root, 'reports'), maxBytes: 64 });
    assert.equal(copied.mode, 'copied');
    assert.equal(await readFile(copied.path, 'utf8'), '# small\n');
    assert.equal(referenced.mode, 'reference');
    assert.match(referenced.uri, /^storage:\/\/sha256\/[a-f0-9]{64}$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
