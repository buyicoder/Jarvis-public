#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = await mkdtemp(join(tmpdir(), 'jarvis-public-clean-package-'));
const packDir = join(root, 'pack');
const source = join(root, 'source');
const home = join(root, 'home');
try {
  await Promise.all([mkdir(packDir), mkdir(source), mkdir(home)]);
  run('npm', ['pack', '--json', '--pack-destination', packDir]);
  const archive = join(packDir, (await readdir(packDir)).find((file) => file.endsWith('.tgz')));
  run(process.execPath, ['scripts/privacy-scan.mjs', '--package', archive]);
  run('tar', ['-xzf', archive, '-C', source, '--strip-components=1']);
  const env = {
    ...process.env,
    HOME: home,
    JARVIS_CODEX_ADAPTER: '0',
    JARVIS_ACTIVITY_OPT_IN: '0',
    JARVIS_PROVIDER_ENABLED: '0',
    JARVIS_PROVIDER_API_KEY: '',
    JARVIS_BROWSER_HISTORY_PATHS: '',
  };
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'JARVIS_CODEX_STATE_PATH']) delete env[key];
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: source, env });
  run(process.execPath, ['bin/jarvis.mjs', 'init'], { cwd: source, env });
  run(process.execPath, ['bin/jarvis.mjs', 'doctor'], { cwd: source, env });
  run(process.execPath, ['bin/jarvis.mjs', 'threads', 'codex-status'], { cwd: source, env });
  run(process.execPath, ['bin/jarvis.mjs', 'activity', 'status'], { cwd: source, env });
  console.log(JSON.stringify({ ok: true, noGit: true, privacy: 'pass', optionalAdapters: 'disabled' }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
}
