#!/usr/bin/env node
import { _electron as electron } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const executable = resolve(root, 'dist', `mac-${arch}`, 'Jarvis.app', 'Contents', 'MacOS', 'Electron');
const forbidden = /(?:Error:|traceback|undefined|null|ENOENT|EACCES|\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/i;
if (process.platform !== 'darwin') throw new Error('Packaged Electron smoke is required on macOS.');
if (!existsSync(executable)) throw new Error(`Packaged executable missing: ${executable}`);

const sandbox = await mkdtemp(join(tmpdir(), 'jarvis-public-packaged-'));
const evidence = process.env.JARVIS_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'jarvis-public-evidence-'));
const errors = [];
const externalRequests = [];
let packaged;
const attach = (page) => {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) externalRequests.push(request.url()); });
};
try {
  packaged = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${join(sandbox, 'user-data')}`], env: {
    ...process.env,
    HOME: join(sandbox, 'home'),
    JARVIS_HOME: join(sandbox, 'state'),
    JARVIS_RUNTIME_DIR: join(sandbox, 'runtime'),
    JARVIS_MEMORY_DIR: join(sandbox, 'vault'),
    JARVIS_ACTIVITY_OPT_IN: '0',
    JARVIS_CODEX_ADAPTER: '0',
    JARVIS_PROVIDER_ENABLED: '0',
    JARVIS_PROVIDER_API_KEY: '',
  } });
  packaged.on('window', attach);
  packaged.windows().forEach(attach);
  const page = packaged.windows()[0] || await packaged.firstWindow({ timeout: 30000 });
  attach(page);
  await page.waitForLoadState('networkidle', { timeout: 20000 });
  const text = await page.locator('body').innerText({ timeout: 10000 });
  if (text.length < 300 || !text.includes('Jarvis') || forbidden.test(text)) throw new Error('Packaged first screen failed product/privacy assertions.');
  await page.locator('[data-view="war-room"]').first().click();
  await page.locator('#war-room h2').waitFor({ state: 'visible' });
  if (errors.length) throw new Error(`Renderer errors: ${errors.join(' | ')}`);
  if (externalRequests.length) throw new Error(`Unexpected external request: ${externalRequests[0]}`);
  const status = JSON.parse(await readFile(join(sandbox, 'runtime', 'status.json'), 'utf8'));
  if (status.memoryDir !== join(sandbox, 'vault')) throw new Error('Packaged app escaped the isolated Vault.');
  await mkdir(evidence, { recursive: true });
  const screenshot = join(evidence, 'packaged-war-room.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({ ok: true, interaction: 'war-room-opened', screenshot, loopbackOnly: true, memoryBoundary: true }, null, 2));
} finally {
  if (packaged) await packaged.close().catch(() => {});
  await rm(sandbox, { recursive: true, force: true });
}
