#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, mkdir, readFile, readlink, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  PREVIEW_VERSION,
  RELEASE_ARCH,
  BUNDLE_BUILD_VERSION,
  BUNDLE_SHORT_VERSION,
  renderSha256Sums,
  sha256Artifact,
} from './lib/release-integrity.mjs';

if (process.platform !== 'darwin') throw new Error('Release artifact verification requires macOS.');

const root = resolve(import.meta.dirname, '..');
const dist = resolve(process.env.JARVIS_RELEASE_DIST || join(root, 'dist'));
const prefix = `Jarvis-${PREVIEW_VERSION}-${RELEASE_ARCH}`;
const zip = join(dist, `${prefix}.zip`);
const dmg = join(dist, `${prefix}.dmg`);
const buildInfoPath = join(dist, 'BUILD_INFO.json');
const sumsPath = join(dist, 'SHA256SUMS');
for (const path of [zip, dmg, buildInfoPath, sumsPath]) {
  if (!existsSync(path)) throw new Error(`Release artifact missing: ${path}`);
}

const buildInfo = JSON.parse(await readFile(buildInfoPath, 'utf8'));
if (buildInfo.schema !== 'jarvis-public-build-info/v1') throw new Error('Unexpected BUILD_INFO schema.');
if (buildInfo.version !== PREVIEW_VERSION || buildInfo.arch !== RELEASE_ARCH) throw new Error('BUILD_INFO release identity mismatch.');
if (!/^[a-f0-9]{40}$/i.test(buildInfo.commit)) throw new Error('BUILD_INFO commit is not a full Git SHA.');
if (buildInfo.signature !== 'ad-hoc' || buildInfo.developerIdSigned !== false || buildInfo.notarized !== false) throw new Error('BUILD_INFO trust claims do not match the Developer Preview.');

const artifacts = [];
for (const path of [zip, dmg]) artifacts.push({ file: basename(path), ...await sha256Artifact(path) });
if (JSON.stringify(buildInfo.artifacts) !== JSON.stringify(artifacts)) throw new Error('BUILD_INFO artifact digest mismatch.');
if (await readFile(sumsPath, 'utf8') !== renderSha256Sums(artifacts)) throw new Error('SHA256SUMS digest mismatch.');

const workspace = await mkdtemp(join(tmpdir(), 'jarvis-public-release-'));
const extracted = join(workspace, 'zip');
const mount = join(workspace, 'dmg');
let attached = false;
try {
  await mkdir(extracted);
  await mkdir(mount);
  run('unzip', ['-tq', zip]);
  run('ditto', ['-x', '-k', zip, extracted]);
  run('hdiutil', ['verify', dmg]);
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;

  const zipApp = join(extracted, 'Jarvis.app');
  const dmgApp = join(mount, 'Jarvis.app');
  verifyApp(zipApp);
  verifyApp(dmgApp);

  const applications = join(mount, 'Applications');
  const info = await lstat(applications);
  if (!info.isSymbolicLink() || await readlink(applications) !== '/Applications') {
    throw new Error('DMG must contain an Applications symlink.');
  }

  if (process.argv.includes('--smoke')) {
    run(process.execPath, [join(root, 'scripts', 'smoke-packaged-app.mjs')], {
      env: { ...process.env, JARVIS_PACKAGED_APP: zipApp },
    });
  }
} finally {
  if (attached) run('hdiutil', ['detach', mount], { allowFailure: true });
  await rm(workspace, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  schema: 'jarvis-public-release-verification/v1',
  version: PREVIEW_VERSION,
  arch: RELEASE_ARCH,
  commit: buildInfo.commit,
  artifacts,
  smoke: process.argv.includes('--smoke'),
}, null, 2));

function verifyApp(app) {
  if (!existsSync(app)) throw new Error(`Packaged app missing: ${app}`);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const executable = join(app, 'Contents', 'MacOS', 'Electron');
  const arches = capture('lipo', ['-archs', executable]).split(/\s+/).filter(Boolean);
  if (arches.length !== 1 || arches[0] !== RELEASE_ARCH) {
    throw new Error(`Expected an arm64-only executable, received: ${arches.join(' ')}`);
  }
  const plist = join(app, 'Contents', 'Info.plist');
if (capture('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]) !== BUNDLE_SHORT_VERSION) {
    throw new Error('Unexpected CFBundleShortVersionString.');
  }
  if (capture('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', plist]) !== BUNDLE_BUILD_VERSION) {
    throw new Error('Unexpected CFBundleVersion.');
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.signal || `exit ${result.status}`}`);
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, { stdio: 'inherit', ...spawnOptions });
  if (!allowFailure && result.status !== 0) throw new Error(`${command} failed with ${result.signal || `exit ${result.status}`}`);
}
