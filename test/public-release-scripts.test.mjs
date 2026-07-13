import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const packageSource = await readFile(new URL('../scripts/package-macos.mjs', import.meta.url), 'utf8');
const verifySource = await readFile(new URL('../scripts/verify-release-artifacts.mjs', import.meta.url), 'utf8');
const smokeSource = await readFile(new URL('../scripts/smoke-packaged-app.mjs', import.meta.url), 'utf8');
const gateSource = await readFile(new URL('../scripts/release-gate.mjs', import.meta.url), 'utf8');

test('macOS release preparation signs the complete arm64 app and creates installable archives', () => {
  assert.match(packageSource, /process\.arch !== RELEASE_ARCH/);
  assert.match(packageSource, /\['--force', '--deep', '--sign', '-', app\]/);
  assert.match(packageSource, /\['--verify', '--deep', '--strict', '--verbose=2', app\]/);
  assert.match(packageSource, /symlink\('\/Applications'/);
  assert.match(packageSource, /SHA256SUMS/);
  assert.match(packageSource, /BUILD_INFO\.json/);
});

test('release verification checks extracted ZIP and mounted DMG before the real window smoke', () => {
  assert.match(verifySource, /\['-tq', zip\]/);
  assert.match(verifySource, /\['verify', dmg\]/);
  assert.match(verifySource, /\['attach', '-readonly', '-nobrowse'/);
  assert.match(verifySource, /JARVIS_PACKAGED_APP: zipApp/);
  assert.match(smokeSource, /process\.argv\.indexOf\('--app'\)/);
  assert.match(smokeSource, /process\.env\.JARVIS_PACKAGED_APP/);
  assert.match(gateSource, /verify-release-artifacts\.mjs', '--smoke'/);
});
