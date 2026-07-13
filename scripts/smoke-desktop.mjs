#!/usr/bin/env node
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sandbox = await mkdtemp(join(tmpdir(), 'jarvis-public-desktop-'));
const evidence = process.env.JARVIS_EVIDENCE_DIR || await mkdtemp(join(tmpdir(), 'jarvis-public-evidence-'));
let desktop;
try {
  desktop = await electron.launch({ args: ['.'], cwd: root, env: {
    ...process.env,
    HOME: join(sandbox, 'home'),
    JARVIS_HOME: join(sandbox, 'state'),
    JARVIS_RUNTIME_DIR: join(sandbox, 'runtime'),
    JARVIS_MEMORY_DIR: join(sandbox, 'vault'),
    JARVIS_ACTIVITY_OPT_IN: '0',
    JARVIS_CODEX_ADAPTER: '0',
    JARVIS_PROVIDER_ENABLED: '0',
  } });
  const page = await desktop.firstWindow({ timeout: 20000 });
  await page.waitForLoadState('networkidle');
  const text = await page.locator('body').innerText();
  if (text.length < 300 || !text.includes('Jarvis') || !text.includes('Today')) throw new Error('Desktop first screen is blank or incomplete.');
  await page.locator('[data-view="war-room"]').first().click();
  await page.locator('#war-room h2').waitFor({ state: 'visible' });
  await mkdir(evidence, { recursive: true });
  const screenshot = join(evidence, 'desktop-first-run.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  const status = JSON.parse(await readFile(join(sandbox, 'runtime', 'status.json'), 'utf8'));
  console.log(JSON.stringify({ ok: true, interaction: 'war-room-opened', screenshot, memoryBoundary: status.memoryDir === join(sandbox, 'vault') }, null, 2));
} finally {
  if (desktop) await desktop.close().catch(() => {});
  await rm(sandbox, { recursive: true, force: true });
}
