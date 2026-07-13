import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { lifecycleStatus } from './governance.mjs';

const TABLES = [
  'projects', 'roles', 'role_assignments', 'tasks', 'task_events', 'reports',
  'artifacts', 'decisions', 'permission_snapshots', 'automations',
];

const MIGRATION = `
  CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS roles (role_id TEXT PRIMARY KEY, name TEXT NOT NULL, immutable INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS role_assignments (source_key TEXT PRIMARY KEY, project_id TEXT NOT NULL, role_id TEXT NOT NULL, assignee_id TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS assignments_project_status ON role_assignments(project_id, status);
  CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, project_id TEXT, owner_id TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS task_events (source_key TEXT PRIMARY KEY, task_id TEXT, project_id TEXT, event_type TEXT NOT NULL, lifecycle TEXT NOT NULL, payload_json TEXT NOT NULL, occurred_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS events_project_time ON task_events(project_id, occurred_at);
  CREATE TABLE IF NOT EXISTS reports (source_key TEXT PRIMARY KEY, report_id TEXT NOT NULL, project_id TEXT, status TEXT NOT NULL, feedback_receipt TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS artifacts (source_key TEXT PRIMARY KEY, report_id TEXT, uri TEXT NOT NULL, sha256 TEXT, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS decisions (source_key TEXT PRIMARY KEY, project_id TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS permission_snapshots (source_key TEXT PRIMARY KEY, request_id TEXT, project_id TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS automations (source_key TEXT PRIMARY KEY, project_id TEXT, owner_id TEXT, status TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

function now(value = {}) {
  return value.updatedAt || value.createdAt || value.occurredAt || new Date().toISOString();
}

function stableKey(prefix, value) {
  return `${prefix}:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function json(value) {
  return JSON.stringify(value || {});
}

function parse(value) {
  return JSON.parse(value);
}

export function controlDbPath(config = {}) {
  return resolve(config.controlDbFile || join(config.runtimeDir || 'runtime', 'control.db'));
}

export function openControlDb(config = {}) {
  const path = controlDbPath(config);
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(MIGRATION);
    db.prepare('INSERT OR IGNORE INTO schema_migrations(version,name,applied_at) VALUES(1,?,?)').run('public-control-plane-v1', new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  return db;
}

function upsertProject(db, value) {
  const projectId = String(value.projectId || value.id || '').trim();
  if (!projectId) return 0;
  db.prepare(`INSERT INTO projects(project_id,name,path,status,payload_json,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(project_id) DO UPDATE SET name=excluded.name,path=excluded.path,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .run(projectId, value.name || projectId, value.path || '', value.status || 'active', json(value), now(value));
  return 1;
}

function upsertAssignment(db, projectId, value, sourceKey) {
  const roleId = String(value.roleId || value.role || '').trim();
  const assigneeId = String(value.assigneeId || value.threadId || value.ownerId || '').trim();
  if (!projectId || !roleId || !assigneeId) return 0;
  const immutable = roleId === 'jarvis-root' || value.immutable === true ? 1 : 0;
  db.prepare(`INSERT INTO roles(role_id,name,immutable,payload_json,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(role_id) DO UPDATE SET name=excluded.name,immutable=MAX(roles.immutable,excluded.immutable),payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .run(roleId, value.name || roleId, immutable, json(value), now(value));
  db.prepare(`INSERT INTO role_assignments(source_key,project_id,role_id,assignee_id,status,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(source_key) DO UPDATE SET project_id=excluded.project_id,role_id=excluded.role_id,assignee_id=excluded.assignee_id,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .run(sourceKey, projectId, roleId, assigneeId, value.status || 'active', json(value), now(value));
  return 1;
}

function upsertEvent(db, value, sourceKey) {
  const eventId = value.eventId || sourceKey || randomUUID();
  const taskId = value.taskId || null;
  if (taskId) {
    db.prepare(`INSERT INTO tasks(task_id,project_id,owner_id,status,payload_json,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET project_id=excluded.project_id,owner_id=excluded.owner_id,status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
      .run(taskId, value.projectId || null, value.ownerId || null, value.status || 'unknown', json(value), now(value));
  }
  db.prepare(`INSERT INTO task_events(source_key,task_id,project_id,event_type,lifecycle,payload_json,occurred_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(source_key) DO UPDATE SET task_id=excluded.task_id,project_id=excluded.project_id,event_type=excluded.event_type,lifecycle=excluded.lifecycle,payload_json=excluded.payload_json,occurred_at=excluded.occurred_at`)
    .run(sourceKey || stableKey('event', eventId), taskId, value.projectId || null, value.type || 'note', lifecycleStatus(value), json({ ...value, eventId }), now(value));
  if (value.type === 'decision') {
    db.prepare(`INSERT INTO decisions(source_key,project_id,status,payload_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(source_key) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
      .run(sourceKey || stableKey('decision', eventId), value.projectId || null, lifecycleStatus(value), json(value), now(value));
  }
  return 1;
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function readJsonl(path) {
  try {
    return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function reconcileControlPlane(config = {}) {
  const projects = await readJson(config.legacyProjectsFile || join(config.runtimeDir || 'runtime', 'projects.json'), { projects: [] });
  const events = await readJsonl(config.legacyEventsFile || join(config.runtimeDir || 'runtime', 'events.jsonl'));
  const db = openControlDb(config);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const project of projects.projects || []) {
      upsertProject(db, project);
      for (const role of project.roles || project.assignments || []) {
        if (role.roleId === 'jarvis-root' || role.role === 'jarvis-root' || role.immutable === true) {
          const existing = db.prepare("SELECT assignee_id FROM role_assignments WHERE project_id=? AND role_id=? AND status IN ('active','current') LIMIT 1").get(project.projectId || project.id, role.roleId || role.role);
          if (existing && existing.assignee_id !== (role.assigneeId || role.threadId || role.ownerId)) throw new Error('Immutable root assignment cannot be replaced.');
        }
        upsertAssignment(db, project.projectId || project.id, role, stableKey('assignment', `${project.projectId || project.id}:${role.roleId || role.role}:${role.assigneeId || role.threadId}`));
      }
    }
    for (const event of events) upsertEvent(db, event, stableKey('legacy-event', event.eventId || json(event)));
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  const rows = Object.fromEntries(TABLES.map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
  db.close();
  return { ok: true, database: controlDbPath(config), rows };
}

export async function writeControlEvent(config, value) {
  const db = openControlDb(config);
  try {
    upsertEvent(db, value, stableKey('event', value.eventId || json(value)));
    return { ok: true, eventId: value.eventId };
  } finally { db.close(); }
}

export function readWarRoom(config, projectId = '') {
  if (!existsSync(controlDbPath(config))) return { source: 'control.db', projectId, projects: [], assignments: [], current: [], timeline: [] };
  const db = openControlDb(config);
  try {
    const projects = db.prepare('SELECT payload_json FROM projects WHERE (? = \'\' OR project_id = ?) ORDER BY project_id').all(projectId, projectId).map((row) => parse(row.payload_json));
    const assignments = db.prepare('SELECT payload_json FROM role_assignments WHERE (? = \'\' OR project_id = ?) AND status IN (\'active\',\'current\') ORDER BY role_id,assignee_id').all(projectId, projectId).map((row) => parse(row.payload_json));
    const current = db.prepare("SELECT lifecycle,payload_json FROM task_events WHERE (? = '' OR project_id = ?) AND lifecycle = 'current' ORDER BY occurred_at").all(projectId, projectId).map((row) => ({ lifecycle: row.lifecycle, ...parse(row.payload_json) }));
    const timeline = db.prepare("SELECT lifecycle,payload_json FROM task_events WHERE (? = '' OR project_id = ?) AND lifecycle != 'current' ORDER BY occurred_at DESC LIMIT 500").all(projectId, projectId).map((row) => ({ lifecycle: row.lifecycle, ...parse(row.payload_json) })).reverse();
    return {
      source: 'control.db', projectId, projects, assignments,
      current,
      timeline,
    };
  } finally { db.close(); }
}

export function controlDoctor(config = {}) {
  const checks = [];
  try {
    const db = openControlDb(config);
    const actual = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    checks.push({ name: 'schema', ok: TABLES.every((table) => actual.has(table)), detail: `version=${db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version}` });
    const duplicates = db.prepare("SELECT project_id,role_id,COUNT(*) AS count FROM role_assignments WHERE status IN ('active','current') GROUP BY project_id,role_id HAVING count > 1").all();
    checks.push({ name: 'single_active_assignment', ok: duplicates.length === 0, detail: duplicates.length ? json(duplicates) : 'no duplicate active roles' });
    const receiptless = db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='complete' AND COALESCE(feedback_receipt,'')='' ").get().count;
    checks.push({ name: 'receipt_backed_completion', ok: Number(receiptless) === 0, detail: `${receiptless} receipt-less completed reports` });
    const pending = db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status='feedback_finalize_pending'").get().count;
    checks.push({ name: 'feedback_closeout_complete', ok: Number(pending) === 0, detail: `${pending} pending feedback closeouts` });
    db.close();
  } catch (error) {
    checks.push({ name: 'database', ok: false, detail: error.message });
  }
  return { ok: checks.every((check) => check.ok), database: controlDbPath(config), checks };
}

export async function backupControlDb(config, output) {
  const source = controlDbPath(config);
  if (!existsSync(source)) throw new Error(`Control database not found: ${source}`);
  const target = resolve(output || `${source}.backup`);
  await mkdir(dirname(target), { recursive: true });
  const db = openControlDb(config);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  db.close();
  return target;
}

export async function restoreControlDb(config, backup) {
  const source = resolve(backup);
  if (!(await stat(source)).isFile()) throw new Error('Control backup must be a file.');
  const target = controlDbPath(config);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.restore-${process.pid}`;
  await copyFile(source, temporary);
  const probe = new DatabaseSync(temporary, { readOnly: true });
  const integrity = probe.prepare('PRAGMA integrity_check').get().integrity_check;
  if (integrity !== 'ok') { probe.close(); throw new Error(`Control backup integrity failed: ${integrity}`); }
  const version = probe.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get()?.version;
  const actual = new Set(probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  if (version !== 1 || !TABLES.every((table) => actual.has(table))) { probe.close(); throw new Error('Control backup schema is incomplete or incompatible.'); }
  probe.close();
  await rename(temporary, target);
  return target;
}

export async function finalizeFeedback(config, reportPath, { target, receipt }) {
  if (!target || !receipt) throw new Error('Feedback target and receipt are required.');
  let content = await readFile(reportPath, 'utf8');
  content = content.replace(/\bparent_feedback_sent(\s*[:=]\s*)false\b/g, 'parent_feedback_sent$1true');
  content = content.replace(/^(\s*-\s*)?feedback_receipt:\s*pending actual delivery\s*$/gim, `$1feedback_receipt: \`${receipt}\``);
  if (!/\bparent_feedback_sent\s*[:=]\s*true\b/.test(content)) content += '\nparent_feedback_sent=true\n';
  if (!content.includes(receipt)) content += `\nFeedback receipt: \`${receipt}\`\n`;
  if (!content.includes(target)) content += `Feedback target: \`${target}\`\n`;
  const db = openControlDb(config);
  const reportId = stableKey('report', reportPath);
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO reports(source_key,report_id,project_id,status,feedback_receipt,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(source_key) DO UPDATE SET status=excluded.status,feedback_receipt=excluded.feedback_receipt,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .run(reportId, reportId, null, 'feedback_finalize_pending', receipt, json({ reportPath, target, receipt, parentFeedbackSent: false, processMiss: 'feedback_finalize_pending' }), timestamp);
  const temporary = `${reportPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, reportPath);
  } catch (error) {
    db.close();
    throw error;
  }
  const verified = await readFile(reportPath, 'utf8');
  if (/\bparent_feedback_sent\s*[:=]\s*false\b/.test(verified) || /pending actual delivery/i.test(verified)) {
    db.close();
    throw new Error('Feedback finalization remained contradictory.');
  }
  try {
    db.prepare(`INSERT INTO reports(source_key,report_id,project_id,status,feedback_receipt,payload_json,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(source_key) DO UPDATE SET status=excluded.status,feedback_receipt=excluded.feedback_receipt,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
      .run(reportId, reportId, null, 'complete', receipt, json({ reportPath, target, receipt, parentFeedbackSent: true }), new Date().toISOString());
  } finally { db.close(); }
  return { ok: true, reportPath, target, receipt };
}

export const controlPlaneInternals = { TABLES, MIGRATION, lifecycle: lifecycleStatus, stableKey };
