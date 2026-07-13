import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { discoverRuntime, runJarvisClient } from '../plugins/jarvis/scripts/jarvis-client.mjs';

test('plugin runtime discovery is explicit and missing runtime fails safely', async () => {
  assert.deepEqual(await discoverRuntime({}), { available: false, status: 'unavailable', reason: 'runtime_not_discovered' });
  await assert.rejects(runJarvisClient(['brief'], { env: {}, fetchImpl: async () => { throw new Error('must not call'); } }), /runtime unavailable/i);
});

test('plugin capture uses the external Vault without requiring a running desktop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-plugin-'));
  try {
    const output = await runJarvisClient(['capture', 'portable handoff'], { capturesDir: root });
    assert.match(output, /pending review/);
    const path = output.match(/path=(.+)$/)?.[1];
    assert.match(await readFile(path, 'utf8'), /portable handoff/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
