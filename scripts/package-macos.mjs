#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPublicBundle, copySanitizedSchemas } from './lib/package-privacy.mjs';
import {
  RELEASE_ARCH,
  BUNDLE_BUILD_VERSION,
  BUNDLE_SHORT_VERSION,
  assertPreviewVersion,
  createBuildInfo,
  renderSha256Sums,
  resolveCleanBuildCommit,
  sha256Artifact,
} from './lib/release-integrity.mjs';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const name = 'Jarvis';
const version = assertPreviewVersion(pkg.version);
const arch = process.env.JARVIS_BUILD_ARCH || RELEASE_ARCH;
const dist = join(root, 'dist');
const app = join(dist, `mac-${arch}`, `${name}.app`);
const resources = join(app, 'Contents', 'Resources', 'app');
const electron = join(root, 'node_modules', 'electron', 'dist', 'Electron.app');

if (process.platform !== 'darwin') throw new Error('macOS packaging requires macOS.');
if (process.arch !== RELEASE_ARCH || arch !== RELEASE_ARCH) {
  throw new Error(`Developer Preview packaging requires an ${RELEASE_ARCH} host and artifact.`);
}
if (!existsSync(electron)) throw new Error('Electron is missing. Run npm install first.');

// Bind every artifact to the exact clean source tree before dist is mutated.
const commit = resolveCleanBuildCommit(root);
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, `mac-${arch}`), { recursive: true });
run('ditto', [electron, app]);
await mkdir(resources, { recursive: true });
for (const entry of ['bin', 'config', 'scripts', 'web', 'skills', 'plugins', 'docs', 'package.json', 'package-lock.json', 'README.md', 'LICENSE']) {
  const source = join(root, entry);
  if (existsSync(source)) await cp(source, join(resources, entry), { recursive: true });
}
await copySanitizedSchemas(root, resources);
run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: resources });
await assertPublicBundle(resources);
run(process.execPath, [join(resources, 'scripts', 'privacy-scan.mjs'), '--app', resources]);

const plist = join(app, 'Contents', 'Info.plist');
setPlist(plist, 'CFBundleDisplayName', name);
setPlist(plist, 'CFBundleIdentifier', 'org.jarvislocal.desktop');
setPlist(plist, 'CFBundleName', name);
setPlist(plist, 'CFBundleShortVersionString', BUNDLE_SHORT_VERSION);
setPlist(plist, 'CFBundleVersion', BUNDLE_BUILD_VERSION);
setPlist(plist, 'LSApplicationCategoryType', 'public.app-category.productivity');

// Electron ships signed nested helpers. The copied and modified outer bundle must
// be signed again as a complete unit after all resources and plist values settle.
run('codesign', ['--force', '--deep', '--sign', '-', app]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);

const zip = join(dist, `${name}-${version}-${arch}.zip`);
const dmg = join(dist, `${name}-${version}-${arch}.dmg`);
const dmgRoot = join(dist, '.dmg-root');
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
await mkdir(dmgRoot, { recursive: true });
try {
  run('ditto', [app, join(dmgRoot, `${name}.app`)]);
  await symlink('/Applications', join(dmgRoot, 'Applications'));
  run('hdiutil', ['create', '-volname', name, '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', dmg]);
} finally {
  await rm(dmgRoot, { recursive: true, force: true });
}

const artifacts = await Promise.all([zip, dmg].map(async (path) => ({ file: basename(path), ...await sha256Artifact(path) })));
const buildInfo = createBuildInfo({ version, commit, arch, artifacts });
await writeFile(join(dist, 'SHA256SUMS'), renderSha256Sums(artifacts));
await writeFile(join(dist, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
run(process.execPath, [join(root, 'scripts', 'verify-release-artifacts.mjs')]);

console.log(JSON.stringify({ ok: true, app, zip, dmg, commit, arch, privacy: 'pass', integrity: 'pass' }, null, 2));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.signal || `exit ${result.status}`}`);
}

function setPlist(path, key, value) {
  run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path]);
}
