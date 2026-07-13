import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/jarvis.mjs', import.meta.url));
function run(args, root, extra = {}) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      JARVIS_HOME: root,
      JARVIS_VAULT_DIR: join(root, 'vault'),
      JARVIS_RUNTIME_DIR: join(root, 'runtime'),
      JARVIS_CODEX_ADAPTER: '0',
      JARVIS_ACTIVITY_OPT_IN: '0',
      ...extra,
    },
  }));
}

test('control CLI reconciles, diagnoses, records and projects synthetic work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-cli-control-'));
  assert.equal(run(['control', 'reconcile'], root).ok, true);
  assert.equal(run(['doctor', '--control-plane'], root).ok, true);
  assert.equal(run(['control', 'event', '--event-id', 'e1', '--project', 'demo', '--task', 't1', '--status', 'active', '--summary', 'Synthetic work'], root).ok, true);
  assert.equal(run(['war-room', '--project', 'demo'], root).current.length, 1);
});

test('optional integrations and policy commands degrade safely without credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-cli-optional-'));
  assert.equal(run(['threads', 'codex-status'], root).reason, 'not_configured');
  assert.equal(run(['activity', 'status'], root).status, 'disabled');
  assert.equal(run(['provider', 'status'], root).status, 'disabled');
  assert.equal(run(['models', 'route', '--complexity', '3', '--risk', 'medium'], root).applyAutomatically, false);
  assert.equal(run(['tokens', 'audit'], root).label, 'local usage telemetry, not billing');
});

test('legacy lifecycle commands remain compatible after modular expansion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-cli-legacy-'));
  assert.equal(run(['init'], root).initialized, true);
  assert.equal(run(['doctor'], root).ok, true);
  assert.equal(run(['morning'], root).date.length, 10);
  assert.equal(run(['evening'], root).writes, false);
  assert.equal(run(['search', 'nothing-yet'], root).results.length, 0);
});
