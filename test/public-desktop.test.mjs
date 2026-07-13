import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createUiServer } from '../scripts/lib/ui-server.mjs';

test('desktop server renders a nonblank public-safe workspace and local APIs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-ui-'));
  const server = createUiServer({
    config: { runtimeDir: join(root, 'runtime'), controlDbFile: join(root, 'runtime', 'control.db'), memoryDir: join(root, 'vault'), activityOptIn: false },
  });
  try {
    await server.listen(0, '127.0.0.1');
    const html = await (await fetch(server.url)).text();
    assert.match(html, /Jarvis/);
    assert.match(html, /Project War Room/);
    assert.doesNotMatch(html, /undefined|traceback|\/Users\//i);
    const status = await (await fetch(`${server.url}/api/status`)).json();
    assert.equal(status.running, true);
    assert.equal(status.integrations.activity, 'disabled');
    const room = await (await fetch(`${server.url}/api/war-room?project=demo`)).json();
    assert.deepEqual(room.current, []);
    assert.equal((await fetch(`${server.url}/../package.json`)).status, 404);
  } finally { await server.close(); await rm(root, { recursive: true, force: true }); }
});

test('desktop shell enforces context isolation and loopback UI', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../scripts/lib/electron-main.mjs', import.meta.url), 'utf8'));
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /127\.0\.0\.1/);
});
