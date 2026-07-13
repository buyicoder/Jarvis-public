import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const WEBKIT_EPOCH_OFFSET_MICROSECONDS = 11644473600000000;

export function aggregateBrowserMetadata(visits = []) {
  const buckets = new Map();
  for (const visit of visits) {
    let parsed;
    try { parsed = new URL(visit.url); } catch { continue; }
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    const visitedAt = new Date(visit.visitedAt || Date.now());
    if (Number.isNaN(visitedAt.getTime())) continue;
    const hourBucket = `${String(visitedAt.getUTCHours()).padStart(2, '0')}:00Z`;
    const key = `${parsed.hostname.toLowerCase()}|${hourBucket}`;
    const current = buckets.get(key) || { domain: parsed.hostname.toLowerCase(), count: 0, hourBucket };
    current.count += 1;
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((a, b) => `${a.domain}:${a.hourBucket}`.localeCompare(`${b.domain}:${b.hourBucket}`));
}

function readChromiumMetadata(path, now = new Date()) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const cutoff = Math.floor(now.getTime() * 1000 + WEBKIT_EPOCH_OFFSET_MICROSECONDS - 24 * 60 * 60 * 1_000_000);
    const rows = db.prepare(`SELECT urls.url AS url, visits.visit_time AS visit_time
      FROM visits JOIN urls ON urls.id = visits.url WHERE visits.visit_time >= ? ORDER BY visits.visit_time`).all(cutoff);
    return rows.map((row) => ({ url: row.url, visitedAt: new Date((Number(row.visit_time) - WEBKIT_EPOCH_OFFSET_MICROSECONDS) / 1000).toISOString() }));
  } finally { db.close(); }
}

export async function collectActivity(config = {}, options = {}) {
  if (config.activityOptIn !== true) return { enabled: false, status: 'disabled', sensors: {} };
  const visits = [...(options.browserVisits || [])];
  const warnings = [];
  for (const path of config.browserHistoryPaths || []) {
    if (!existsSync(path)) { warnings.push({ path, reason: 'unavailable' }); continue; }
    try { visits.push(...readChromiumMetadata(path, options.now)); }
    catch (error) { warnings.push({ path, reason: error.code === 'EACCES' ? 'permission_denied' : 'unavailable' }); }
  }
  const domains = aggregateBrowserMetadata(visits);
  const browserStatus = domains.length ? 'ready' : 'unavailable';
  return {
    enabled: true,
    status: browserStatus === 'ready' ? 'ready' : 'partial',
    sensors: { browser: { status: browserStatus, domains, warnings } },
    privacy: { rawUrlsPersisted: false, titlesPersisted: false, queriesPersisted: false, cookiesRead: false },
  };
}

export function routeAutomation({ projectId, roster = [] }) {
  const current = roster.find((item) => item.projectId === projectId && item.roleId === 'owner' && ['active', 'current'].includes(item.status));
  return { projectId, ownerId: current?.assigneeId || '', action: 'dispatch_recommendation', execute: false };
}

function renderActivity(activity) {
  const domains = activity?.sensors?.browser?.domains || [];
  if (!activity?.enabled) return '- Activity collection: disabled (opt-in required)';
  if (!domains.length) return '- Browser metadata: unavailable or no recent activity';
  return ['- Browser metadata (aggregated):', ...domains.map((item) => `  - ${item.domain}: ${item.count} visits during ${item.hourBucket}`)].join('\n');
}

export async function writeDailyEvidence({ memoryDir, activity, now = new Date() }) {
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString();
  const content = `# Today\n\n- Date: ${date}\n- Generated: ${stamp}\n${renderActivity(activity)}\n`;
  const todayPath = join(memoryDir, 'core', 'today.md');
  const dailyPath = join(memoryDir, 'daily', date.slice(0, 4), date.slice(5, 7), `${date}-scan.md`);
  await mkdir(dirname(todayPath), { recursive: true });
  await mkdir(dirname(dailyPath), { recursive: true });
  await writeFile(todayPath, content, 'utf8');
  await appendFile(dailyPath, `\n## Scan ${stamp}\n\n${renderActivity(activity)}\n`, 'utf8');
  return { todayPath, dailyPath, date };
}

export const activityInternals = { WEBKIT_EPOCH_OFFSET_MICROSECONDS, readChromiumMetadata };
