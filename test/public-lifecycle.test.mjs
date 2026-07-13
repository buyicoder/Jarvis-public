import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyProposal, approveProposal, capture, createProposal, latestProposal } from '../scripts/lib/lifecycle.mjs';

test('capture writes only to the supplied external Vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-capture-'));
  const path = await capture('Keep this reusable lesson', { capturesDir: join(root, 'captures'), now: new Date('2026-01-02T03:04:05Z') });
  assert.match(path, new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(await readFile(path, 'utf8'), /status: raw/);
});

test('proposal requires approval and applies idempotently inside Vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-proposal-'));
  const record = await createProposal({
    proposalsDir: join(root, 'proposals'),
    items: [{ target: 'memory/core/patterns/example.md', mode: 'append', heading: 'Lesson', content: 'Prefer reviewable changes.' }],
    now: new Date('2026-01-02T03:04:05Z'),
  });
  await assert.rejects(() => applyProposal(record, { memoryDir: root }), /must be approved/);
  await approveProposal(record);
  assert.equal(await applyProposal(record, { memoryDir: root }), 1);
  assert.match(await readFile(join(root, 'core/patterns/example.md'), 'utf8'), /Prefer reviewable changes/);
  await assert.rejects(() => applyProposal(record, { memoryDir: root }), /must be approved/);
});

test('proposal target cannot escape the configured Vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-boundary-'));
  const record = await createProposal({ proposalsDir: join(root, 'proposals'), items: [{ target: 'memory/../outside.md', content: 'no' }] });
  await approveProposal(record);
  await assert.rejects(() => applyProposal(record, { memoryDir: root }), /Unsafe proposal target/);
});

test('idempotency uses exact rendered blocks rather than content substrings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-exact-'));
  const first = await createProposal({ proposalsDir: join(root, 'proposals'), items: [{ target: 'memory/core/example.md', heading: 'First', content: 'foobar' }] });
  await approveProposal(first);
  await applyProposal(first, { memoryDir: root });
  const second = await createProposal({ proposalsDir: join(root, 'proposals'), items: [{ target: 'memory/core/example.md', heading: 'Second', content: 'foo' }], now: new Date(Date.now() + 1000) });
  await approveProposal(second);
  assert.equal(await applyProposal(second, { memoryDir: root }), 1);
  assert.match(await readFile(join(root, 'core/example.md'), 'utf8'), /## Second\nfoo/);
});

test('same-timestamp captures and proposals never overwrite each other', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-collision-'));
  const now = new Date('2026-01-02T03:04:05Z');
  const captureA = await capture('same', { capturesDir: join(root, 'captures'), now });
  const captureB = await capture('same', { capturesDir: join(root, 'captures'), now });
  assert.notEqual(captureA, captureB);
  const proposalA = await createProposal({ proposalsDir: join(root, 'proposals'), items: [], now });
  const proposalB = await createProposal({ proposalsDir: join(root, 'proposals'), items: [], now });
  assert.notEqual(proposalA.path, proposalB.path);
});

test('proposal cannot follow a symlink outside the Vault', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-symlink-'));
  const outside = await mkdtemp(join(tmpdir(), 'jarvis-outside-'));
  await mkdir(join(root, 'core'), { recursive: true });
  await symlink(outside, join(root, 'core', 'link'));
  const record = await createProposal({ proposalsDir: join(root, 'proposals'), items: [{ target: 'memory/core/link/escaped.md', content: 'no' }] });
  await approveProposal(record);
  await assert.rejects(() => applyProposal(record, { memoryDir: root }), /symlink/);
});

test('concurrent apply permits only one writer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-lock-'));
  const created = await createProposal({ proposalsDir: join(root, 'proposals'), items: [{ target: 'memory/core/example.md', content: 'once' }] });
  await approveProposal(created);
  const first = await latestProposal(join(root, 'proposals'));
  const second = await latestProposal(join(root, 'proposals'));
  const results = await Promise.allSettled([applyProposal(first, { memoryDir: root }), applyProposal(second, { memoryDir: root })]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
});
