import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { openControlDb } from './control-plane.mjs';

const DEMO_PROJECT = 'demo-studio';
const activeInitializations = new Map();

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function hasNonSchemaFile(root, current = root) {
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  for (const entry of entries) {
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`Demo target rejects symlinks: ${path}`);
    if (info.isDirectory()) {
      if (path === join(root, '_schemas')) continue;
      if (await hasNonSchemaFile(root, path)) return true;
    } else if (info.isFile()) return true;
    else throw new Error(`Demo target rejects special files: ${path}`);
  }
  return false;
}

function markerPath(config) {
  return join(config.runtimeDir, 'demo-workspace.json');
}

async function writeMarker(path, payload) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function clearSyntheticRows(db) {
  db.prepare("DELETE FROM task_events WHERE source_key LIKE 'demo:%'").run();
  db.prepare("DELETE FROM decisions WHERE source_key LIKE 'demo:%'").run();
  db.prepare("DELETE FROM reports WHERE source_key LIKE 'demo:%'").run();
  db.prepare("DELETE FROM role_assignments WHERE source_key LIKE 'demo:%'").run();
  db.prepare("DELETE FROM tasks WHERE project_id=?").run(DEMO_PROJECT);
  db.prepare("DELETE FROM projects WHERE project_id=?").run(DEMO_PROJECT);
  db.prepare("DELETE FROM roles WHERE role_id='demo-owner' AND NOT EXISTS (SELECT 1 FROM role_assignments WHERE role_id='demo-owner')").run();
}

export async function readDemoWorkspaceStatus(config) {
  const marker = await readJson(markerPath(config));
  return marker?.status === 'ready'
    ? { initialized: true, synthetic: true, projectId: DEMO_PROJECT, initializedAt: marker.initializedAt }
    : { initialized: false, synthetic: true, projectId: DEMO_PROJECT };
}

export async function initializeDemoWorkspace(config, { confirmSynthetic = false, now = new Date() } = {}) {
  if (!confirmSynthetic) throw new Error('Demo initialization requires explicit confirmation of synthetic data.');
  const key = markerPath(config);
  if (activeInitializations.has(key)) return activeInitializations.get(key);
  const pending = initializeDemoWorkspaceOnce(config, now);
  activeInitializations.set(key, pending);
  try { return await pending; } finally { activeInitializations.delete(key); }
}

async function initializeDemoWorkspaceOnce(config, now) {
  const markerFile = markerPath(config);
  let previous = await readJson(markerFile);
  const db = openControlDb(config);
  try {
    if (previous?.status === 'ready') {
      const project = db.prepare('SELECT COUNT(*) AS count FROM projects WHERE project_id=?').get(DEMO_PROJECT).count;
      const events = db.prepare("SELECT COUNT(*) AS count FROM task_events WHERE source_key LIKE 'demo:%'").get().count;
      const document = await readFile(join(config.memoryDir, 'core', 'projects', 'sample-studio.md'), 'utf8').catch((error) => { if (error.code === 'ENOENT') return ''; throw error; });
      if (Number(project) === 1 && Number(events) === 3 && /Synthetic demo only/.test(document)) {
        return { initialized: true, synthetic: true, projectId: DEMO_PROJECT, initializedAt: previous.initializedAt, alreadyInitialized: true };
      }
      previous = { ...previous, status: 'initializing' };
    }
    if (previous?.status === 'initializing') {
      db.exec('BEGIN IMMEDIATE');
      try { clearSyntheticRows(db); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
      await rm(join(config.memoryDir, 'core', 'projects', 'sample-studio.md'), { force: true });
    }
    const tables = ['projects', 'roles', 'role_assignments', 'tasks', 'task_events', 'reports', 'artifacts', 'decisions', 'permission_snapshots', 'automations'];
    const existingRows = tables.reduce((total, table) => total + Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count), 0);
    if (existingRows) throw new Error('Demo initialization refused because existing control state is not empty.');
    if (await hasNonSchemaFile(config.memoryDir)) throw new Error('Demo initialization refused because the Vault is not empty.');

    await mkdir(dirname(markerFile), { recursive: true, mode: 0o700 });
    await writeMarker(markerFile, { schema: 'jarvis-public-demo/v1', status: 'initializing', projectId: DEMO_PROJECT });

    const timestamp = now.toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const project = { projectId: DEMO_PROJECT, name: 'Sample Studio', path: '', status: 'active', synthetic: true };
      db.prepare('INSERT INTO projects(project_id,name,path,status,payload_json,updated_at) VALUES(?,?,?,?,?,?)').run(DEMO_PROJECT, project.name, '', 'active', JSON.stringify(project), timestamp);
      const role = { projectId: DEMO_PROJECT, roleId: 'demo-owner', assigneeId: 'sample-owner', status: 'active', synthetic: true };
      db.prepare('INSERT INTO roles(role_id,name,immutable,payload_json,updated_at) VALUES(?,?,?,?,?)').run('demo-owner', 'Demo owner', 0, JSON.stringify(role), timestamp);
      db.prepare('INSERT INTO role_assignments(source_key,project_id,role_id,assignee_id,status,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)').run('demo:owner', DEMO_PROJECT, 'demo-owner', 'sample-owner', 'active', JSON.stringify(role), timestamp);
      const events = [
        { key: 'demo:task:walkthrough', taskId: 'demo-walkthrough', type: 'task', status: 'active', lifecycle: 'current', summary: 'Prepare the preview walkthrough' },
        { key: 'demo:task:privacy', taskId: 'demo-privacy', type: 'task', status: 'active', lifecycle: 'current', summary: 'Verify the privacy checklist' },
        { key: 'demo:decision:local', taskId: null, type: 'decision', status: 'resolved', lifecycle: 'resolved', summary: 'Use local-only sample data' },
      ];
      for (const event of events) {
        const payload = { eventId: event.key, projectId: DEMO_PROJECT, taskId: event.taskId, type: event.type, status: event.status, summary: event.summary, synthetic: true };
        if (event.taskId) db.prepare('INSERT INTO tasks(task_id,project_id,owner_id,status,payload_json,updated_at) VALUES(?,?,?,?,?,?)').run(event.taskId, DEMO_PROJECT, 'sample-owner', event.status, JSON.stringify(payload), timestamp);
        db.prepare('INSERT INTO task_events(source_key,task_id,project_id,event_type,lifecycle,payload_json,occurred_at) VALUES(?,?,?,?,?,?,?)').run(event.key, event.taskId, DEMO_PROJECT, event.type, event.lifecycle, JSON.stringify(payload), timestamp);
        if (event.type === 'decision') db.prepare('INSERT INTO decisions(source_key,project_id,status,payload_json,updated_at) VALUES(?,?,?,?,?)').run(event.key, DEMO_PROJECT, 'resolved', JSON.stringify(payload), timestamp);
      }
      const report = { reportId: 'demo-preview-report', projectId: DEMO_PROJECT, status: 'resolved', title: 'Synthetic preview readiness', synthetic: true };
      db.prepare('INSERT INTO reports(source_key,report_id,project_id,status,feedback_receipt,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)').run('demo:report:preview', report.reportId, DEMO_PROJECT, 'resolved', 'synthetic-demo-receipt', JSON.stringify(report), timestamp);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }

    const demoDocument = join(config.memoryDir, 'core', 'projects', 'sample-studio.md');
    await mkdir(dirname(demoDocument), { recursive: true, mode: 0o700 });
    await writeFile(demoDocument, '# Sample Studio\n\n> Synthetic demo only. No personal data.\n\n- Goal: inspect the Developer Preview safely.\n- Owner: Sample owner.\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await writeMarker(markerFile, { schema: 'jarvis-public-demo/v1', status: 'ready', projectId: DEMO_PROJECT, initializedAt: timestamp });
    return { initialized: true, synthetic: true, projectId: DEMO_PROJECT, initializedAt: timestamp, alreadyInitialized: false };
  } finally { db.close(); }
}
