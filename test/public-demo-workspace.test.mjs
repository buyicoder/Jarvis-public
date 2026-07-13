import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { initializeDemoWorkspace, readDemoWorkspaceStatus } from '../scripts/lib/demo-workspace.mjs';
import { openControlDb, readWarRoom, writeControlEvent } from '../scripts/lib/control-plane.mjs';

function config(root) {
  return { memoryDir: join(root, 'vault'), runtimeDir: join(root, 'runtime'), controlDbFile: join(root, 'runtime', 'control.db') };
}

test('demo initialization is explicit, synthetic, external and idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-demo-'));
  try {
    const cfg = config(root);
    assert.equal((await readDemoWorkspaceStatus(cfg)).initialized, false);
    const first = await initializeDemoWorkspace(cfg, { confirmSynthetic: true, now: new Date('2026-07-13T00:00:00Z') });
    assert.equal(first.initialized, true);
    assert.equal(first.synthetic, true);
    const room = readWarRoom(cfg, 'demo-studio');
    assert.equal(room.projects[0].name, 'Sample Studio');
    assert.ok(room.current.some((item) => item.summary === 'Prepare the preview walkthrough'));
    assert.ok(room.timeline.some((item) => item.summary === 'Use local-only sample data'));
    assert.match(await readFile(join(cfg.memoryDir, 'core', 'projects', 'sample-studio.md'), 'utf8'), /Synthetic demo only/);
    const second = await initializeDemoWorkspace(cfg, { confirmSynthetic: true });
    assert.equal(second.alreadyInitialized, true);
    assert.equal(readWarRoom(cfg, 'demo-studio').current.length, room.current.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('demo initialization refuses missing confirmation and existing user state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-demo-refuse-'));
  try {
    const cfg = config(root);
    await assert.rejects(initializeDemoWorkspace(cfg), /explicit confirmation/i);
    await mkdir(join(cfg.memoryDir, 'core'), { recursive: true });
    await writeFile(join(cfg.memoryDir, 'core', 'existing.md'), 'user-owned');
    await assert.rejects(initializeDemoWorkspace(cfg, { confirmSynthetic: true }), /not empty/i);
    await rm(cfg.memoryDir, { recursive: true, force: true });
    await writeControlEvent(cfg, { eventId: 'user-event', projectId: 'real', taskId: 'real-task', status: 'active' });
    await assert.rejects(initializeDemoWorkspace(cfg, { confirmSynthetic: true }), /control state/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('demo initialization recovers a stale marker and coalesces concurrent requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-demo-recovery-'));
  try {
    const cfg = config(root);
    const [first, concurrent] = await Promise.all([
      initializeDemoWorkspace(cfg, { confirmSynthetic: true }),
      initializeDemoWorkspace(cfg, { confirmSynthetic: true }),
    ]);
    assert.equal(first.initialized, true);
    assert.equal(concurrent.initialized, true);
    await rm(cfg.controlDbFile, { force: true });
    await rm(join(cfg.memoryDir, 'core', 'projects', 'sample-studio.md'), { force: true });
    const recovered = await initializeDemoWorkspace(cfg, { confirmSynthetic: true });
    assert.equal(recovered.alreadyInitialized, false);
    assert.equal(readWarRoom(cfg, 'demo-studio').current.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('demo initialization refuses existing automation state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-demo-automation-'));
  try {
    const cfg = config(root);
    const db = openControlDb(cfg);
    db.prepare('INSERT INTO automations(source_key,project_id,owner_id,status,payload_json,updated_at) VALUES(?,?,?,?,?,?)').run('user:auto', 'user-project', 'owner', 'active', '{}', new Date().toISOString());
    db.close();
    await assert.rejects(initializeDemoWorkspace(cfg, { confirmSynthetic: true }), /control state/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
