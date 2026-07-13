#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const packageMode = process.argv.includes('--package');
const checks = [
  ['source-privacy', process.execPath, ['scripts/privacy-scan.mjs']],
  ['syntax', process.execPath, ['--check', 'bin/jarvis.mjs']],
  ['tests', 'npm', ['test']],
  ['clean-package-bootstrap', process.execPath, ['scripts/smoke-clean-package.mjs']],
  ['desktop-first-run', process.execPath, ['scripts/smoke-desktop.mjs']],
];
if (packageMode) checks.push(
  ['mac-package', 'npm', ['run', 'dist:mac']],
  ['app-bundle-privacy', process.execPath, ['scripts/privacy-scan.mjs', '--app', `dist/mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}/Jarvis.app/Contents/Resources/app`]],
  ['packaged-window', process.execPath, ['scripts/smoke-packaged-app.mjs']],
);

const results = [];
for (const [name, command, args] of checks) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: process.env, maxBuffer: 40 * 1024 * 1024 });
  results.push({ name, ok: result.status === 0, exitCode: result.status, stdout: result.stdout?.slice(-2000) || '', stderr: result.stderr?.slice(-2000) || '' });
  if (result.status !== 0) break;
}
const output = { schema: 'jarvis-public-release-gate/v1', ok: results.every((item) => item.ok) && results.length === checks.length, packageMode, results };
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
