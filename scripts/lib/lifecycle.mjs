import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function safeSlug(value) {
  return String(value).trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48) || 'note';
}

export async function capture(text, { capturesDir, type = 'note', now = new Date() }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Capture text is required.');
  const date = localDate(now);
  const dir = join(capturesDir, date.slice(0, 4), date.slice(5, 7));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const time = now.toISOString().slice(11, 19).replaceAll(':', '');
  const path = join(dir, `${date}-${time}-${safeSlug(body)}-${randomUUID().slice(0, 8)}.md`);
  await writeFile(path, `---\ndate: ${date}\ntype: capture\ncapture_type: ${type}\nstatus: raw\n---\n\n${body}\n`, { encoding: 'utf8', mode: 0o600 });
  return path;
}

async function findLatestProposal(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findLatestProposal(path);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      let proposal;
      try { proposal = JSON.parse(await readFile(path, 'utf8')); } catch (error) { throw new Error(`Invalid proposal JSON at ${path}: ${error.message}`); }
      if (['proposed', 'approved'].includes(proposal.status)) return { path, proposal };
    }
  }
  return null;
}

export async function latestProposal(proposalsDir) {
  return findLatestProposal(proposalsDir);
}

export async function createProposal({ proposalsDir, items, now = new Date() }) {
  const date = localDate(now);
  const dir = join(proposalsDir, date.slice(0, 4), date.slice(5, 7));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${date}-${now.toISOString().slice(11, 19).replaceAll(':', '')}-${randomUUID().slice(0, 8)}-proposal.json`);
  const proposal = { schema: 'jarvis-public-proposal/v1', date, status: 'proposed', items };
  await writeFile(path, `${JSON.stringify(proposal, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return { path, proposal };
}

export async function approveProposal(record, now = new Date()) {
  if (!record) throw new Error('No pending proposal found.');
  if (record.proposal.status !== 'proposed') throw new Error(`Cannot approve ${record.proposal.status} proposal.`);
  record.proposal.status = 'approved';
  record.proposal.approvedAt = now.toISOString();
  await atomicJson(record.path, record.proposal);
  return record;
}

function safeTarget(memoryDir, target) {
  const relative = String(target || '').replaceAll('\\', '/').replace(/^memory\//, '');
  if (!relative || relative.includes('..') || relative.startsWith('/')) throw new Error(`Unsafe proposal target: ${target}`);
  const root = resolve(memoryDir);
  const absolute = resolve(root, relative);
  if (!absolute.startsWith(`${root}/`)) throw new Error(`Proposal target escapes the Vault: ${target}`);
  return absolute;
}

async function rejectSymlinkPath(memoryDir, target) {
  const root = resolve(memoryDir);
  const parts = relative(root, target).split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Proposal target contains a symlink: ${current}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function applyProposal(record, { memoryDir, now = new Date() }) {
  if (!record) throw new Error('No pending proposal found.');
  if (record.proposal.status !== 'approved') throw new Error('Proposal must be approved before apply.');
  const lockPath = `${record.path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw new Error('Proposal is already being applied.'); throw error; }
  let applied = 0;
  const grouped = new Map();
  try {
    for (const item of record.proposal.items || []) {
      if ((item.mode || 'append') !== 'append') throw new Error(`Unsupported proposal mode: ${item.mode}`);
      const target = safeTarget(memoryDir, item.target);
      const existing = grouped.get(target) || [];
      existing.push(item);
      grouped.set(target, existing);
    }
    for (const [target, items] of grouped) {
      await rejectSymlinkPath(memoryDir, target);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      let existing = '';
      try { existing = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const additions = [];
      for (const item of items) {
        const content = String(item.content || '').trim();
        const rendered = `\n${item.heading ? `## ${item.heading}\n` : ''}${content}\n`;
        if (!content || existing.includes(rendered) || additions.includes(rendered)) continue;
        additions.push(rendered);
        applied += 1;
      }
      if (additions.length) {
        const handle = await open(target, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW || 0), 0o600);
        try { await handle.writeFile(additions.join(''), 'utf8'); } finally { await handle.close(); }
      }
    }
    record.proposal.status = 'applied';
    record.proposal.appliedAt = now.toISOString();
    await atomicJson(record.path, record.proposal);
    return applied;
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
}
