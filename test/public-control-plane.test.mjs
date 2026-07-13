import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  backupControlDb,
  controlDoctor,
  finalizeFeedback,
  openControlDb,
  readWarRoom,
  reconcileControlPlane,
  restoreControlDb,
  writeControlEvent,
} from '../scripts/lib/control-plane.mjs';

function config(root) {
  return {
    runtimeDir: join(root, 'runtime'),
    controlDbFile: join(root, 'runtime', 'control.db'),
    legacyProjectsFile: join(root, 'legacy', 'projects.json'),
    legacyEventsFile: join(root, 'legacy', 'events.jsonl'),
  };
}

test('control database migrates every canonical public table', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-control-'));
  try {
    const db = openControlDb(config(root));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => row.name);
    for (const name of ['artifacts', 'automations', 'decisions', 'permission_snapshots', 'projects', 'reports', 'role_assignments', 'roles', 'task_events', 'tasks']) {
      assert.ok(tables.includes(name), `missing ${name}`);
    }
    db.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reconcile is idempotent and War Room separates current state from timeline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-reconcile-'));
  try {
    const cfg = config(root);
    await writeFile(cfg.legacyProjectsFile, JSON.stringify({ projects: [{ projectId: 'demo', name: 'Demo', roles: [{ roleId: 'owner', assigneeId: 'local-owner', status: 'active' }] }] }), { recursive: true }).catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(root, 'legacy'), { recursive: true });
      await writeFile(cfg.legacyProjectsFile, JSON.stringify({ projects: [{ projectId: 'demo', name: 'Demo', roles: [{ roleId: 'owner', assigneeId: 'local-owner', status: 'active' }] }] }));
    });
    await writeFile(cfg.legacyEventsFile, [
      JSON.stringify({ eventId: 'open', projectId: 'demo', taskId: 'task-1', type: 'task', status: 'active', summary: 'Current work' }),
      JSON.stringify({ eventId: 'done', projectId: 'demo', taskId: 'task-0', type: 'decision', status: 'resolved', summary: 'Historical choice' }),
    ].join('\n') + '\n');
    const first = await reconcileControlPlane(cfg);
    const second = await reconcileControlPlane(cfg);
    assert.equal(first.ok, true);
    assert.deepEqual(second.rows, first.rows);
    const room = readWarRoom(cfg, 'demo');
    assert.equal(room.current.length, 1);
    assert.equal(room.timeline.length, 1);
    assert.equal(room.assignments.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dual writes, doctor and backup restore preserve a valid projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-recovery-'));
  try {
    const cfg = config(root);
    await writeControlEvent(cfg, { eventId: 'e1', projectId: 'demo', taskId: 't1', type: 'task', status: 'active', summary: 'Ship' });
    assert.equal(controlDoctor(cfg).ok, true);
    const backup = await backupControlDb(cfg, join(root, 'backup', 'control.db'));
    await writeControlEvent(cfg, { eventId: 'e2', projectId: 'demo', taskId: 't2', type: 'task', status: 'active', summary: 'Extra' });
    await restoreControlDb(cfg, backup);
    assert.deepEqual(readWarRoom(cfg, 'demo').current.map((item) => item.eventId), ['e1']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('receipt finalization replaces list-form false and pending fields atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-feedback-'));
  try {
    const cfg = config(root);
    const report = join(root, 'REPORT.md');
    await writeFile(report, '# Report\n- parent_feedback_sent: false\n- feedback_receipt: pending actual delivery\n');
    await finalizeFeedback(cfg, report, { target: 'controller', receipt: 'receipt-1' });
    const content = await readFile(report, 'utf8');
    assert.match(content, /parent_feedback_sent: true/);
    assert.match(content, /feedback_receipt: `receipt-1`/);
    assert.doesNotMatch(content, /false|pending actual delivery/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
