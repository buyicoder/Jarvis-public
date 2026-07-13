import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runResearchRadar } from '../scripts/lib/research-radar.mjs';
import { vectorStoreInternals } from '../scripts/lib/vector-store.mjs';

test('RRF preserves vector and keyword evidence without network access', () => {
  const vector = [{ chunk_id: 'a', content: 'semantic', source: 'fixture', _distance: 0.4 }, { chunk_id: 'b', content: 'other', source: 'fixture', _distance: 0.5 }];
  const keyword = [{ chunk_id: 'a', content: 'semantic', source: 'fixture', _distance: 1.2 }];
  const result = vectorStoreInternals.fuseResults(vector, keyword, 5);
  assert.equal(result[0].chunk_id, 'a');
  assert.ok(result[0]._distance < 0.4);
});

test('research radar is explicit network opt-in and partial failures are recorded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-radar-'));
  try {
    assert.deepEqual(await runResearchRadar({ scansDir: root, network: false }), { enabled: false, status: 'disabled', writes: false, reason: 'network_opt_in_required' });
    const result = await runResearchRadar({
      scansDir: root,
      network: true,
      collectors: [
        async () => [{ name: 'Synthetic local-first paper', url: 'https://example.invalid/paper', description: 'agent memory retrieval', source: 'Synthetic' }],
        async () => { throw new Error('source unavailable'); },
      ],
      now: new Date('2026-07-13T00:00:00Z'),
    });
    assert.equal(result.candidates, 1);
    assert.equal(result.failures.length, 1);
    assert.match(await readFile(result.output, 'utf8'), /Synthetic local-first paper/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
