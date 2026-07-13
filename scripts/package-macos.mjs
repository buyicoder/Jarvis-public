#!/usr/bin/env node
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPublicBundle, copySanitizedSchemas } from './lib/package-privacy.mjs';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const name = 'Jarvis';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const dist = join(root, 'dist');
const app = join(dist, `mac-${arch}`, `${name}.app`);
const resources = join(app, 'Contents', 'Resources', 'app');
const electron = join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
if (process.platform !== 'darwin') throw new Error('macOS packaging requires macOS.');
if (!existsSync(electron)) throw new Error('Electron is missing. Run npm install first.');

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
setPlist(plist, 'CFBundleShortVersionString', pkg.version);
setPlist(plist, 'CFBundleVersion', pkg.version);
setPlist(plist, 'LSApplicationCategoryType', 'public.app-category.productivity');

const zip = join(dist, `${name}-${pkg.version}-${arch}.zip`);
const dmg = join(dist, `${name}-${pkg.version}-${arch}.dmg`);
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
run('hdiutil', ['create', '-volname', name, '-srcfolder', app, '-ov', '-format', 'UDZO', dmg]);
console.log(JSON.stringify({ ok: true, app, zip, dmg, privacy: 'pass' }, null, 2));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed with ${result.signal || `exit ${result.status}`}`);
}
function setPlist(path, key, value) { run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path]); }
