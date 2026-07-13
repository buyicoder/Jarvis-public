import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { aggregateBrowserMetadata, collectActivity, routeAutomation, writeDailyEvidence } from '../scripts/lib/activity-automation.mjs';

test('activity collection is disabled by default and missing permissions degrade safely', async () => {
  assert.deepEqual(await collectActivity({ activityOptIn: false }), { enabled: false, status: 'disabled', sensors: {} });
  const result = await collectActivity({ activityOptIn: true, browserHistoryPaths: ['/missing/history'] });
  assert.equal(result.enabled, true);
  assert.equal(result.sensors.browser.status, 'unavailable');
  assert.deepEqual(result.sensors.browser.domains, []);
});

test('browser evidence keeps aggregate domains and drops URL title query and cookies', () => {
  const result = aggregateBrowserMetadata([
    { url: 'https://docs.example.org/private?q=secret', title: 'Private title', visitedAt: '2026-07-13T01:12:00Z' },
    { url: 'https://docs.example.org/other', title: 'Another title', visitedAt: '2026-07-13T01:33:00Z' },
  ]);
  assert.deepEqual(result, [{ domain: 'docs.example.org', count: 2, hourBucket: '01:00Z' }]);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|title|cookie|query/i);
});

test('automation returns dispatch metadata for the current owner and never executes', () => {
  const result = routeAutomation({ projectId: 'demo', roster: [{ projectId: 'demo', roleId: 'owner', assigneeId: 'owner-2', status: 'active' }] });
  assert.deepEqual(result, { projectId: 'demo', ownerId: 'owner-2', action: 'dispatch_recommendation', execute: false });
});

test('daily evidence overwrites today and appends timestamped history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-daily-'));
  try {
    const result = await writeDailyEvidence({
      memoryDir: root,
      now: new Date('2026-07-13T12:00:00Z'),
      activity: { enabled: true, status: 'ready', sensors: { browser: { status: 'ready', domains: [{ domain: 'example.org', count: 2, hourBucket: '12:00Z' }] } } },
    });
    assert.match(await readFile(result.todayPath, 'utf8'), /2026-07-13/);
    assert.match(await readFile(result.dailyPath, 'utf8'), /example\.org/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
