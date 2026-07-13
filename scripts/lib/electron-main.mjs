import { app, BrowserWindow, shell } from 'electron';
import { cp, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

app.setName('Jarvis');
let window;
let uiServer;
let quitting = false;

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) shell.openExternal(parsed.href);
  } catch {}
}

async function createWindow() {
  process.env.JARVIS_HOME ||= join(app.getPath('userData'), 'state');
  process.env.JARVIS_RUNTIME_DIR ||= join(app.getPath('userData'), 'runtime');
  process.env.JARVIS_MEMORY_DIR ||= join(app.getPath('userData'), 'vault');
  process.env.JARVIS_ACTIVITY_OPT_IN ||= '0';
  const [{ CONFIG }, { createUiServer }, { PUBLIC_SCHEMA_ALLOWLIST }] = await Promise.all([
    import('./config.mjs'), import('./ui-server.mjs'), import('./package-privacy.mjs'),
  ]);
  await mkdir(CONFIG.memoryDir, { recursive: true });
  await mkdir(CONFIG.runtimeDir, { recursive: true });
  for (const relativePath of PUBLIC_SCHEMA_ALLOWLIST) {
    const vaultRelative = relativePath.replace(/^memory\//, '');
    const target = join(CONFIG.memoryDir, vaultRelative);
    await mkdir(join(target, '..'), { recursive: true });
    await cp(join(CONFIG.rootDir, relativePath), target, { force: false }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  }
  uiServer = createUiServer({ config: CONFIG });
  await uiServer.listen(0, '127.0.0.1');
  const status = { role: 'desktop', running: true, api: uiServer.url, memoryDir: CONFIG.memoryDir, runtimeDir: CONFIG.runtimeDir, privacy: { activityOptIn: CONFIG.activityOptIn } };
  const temporary = `${CONFIG.runtimeStatusFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  await rename(temporary, CONFIG.runtimeStatusFile);

  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'Jarvis',
    show: false,
    backgroundColor: '#f4f1e8',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(uiServer.url)) { event.preventDefault(); openExternal(url); } });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(uiServer.url);
}

app.whenReady().then(createWindow).catch((error) => { console.error(`Jarvis desktop failed to start: ${error.message}`); app.exit(1); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', (event) => {
  if (quitting || !uiServer) return;
  event.preventDefault();
  quitting = true;
  uiServer.close().finally(() => app.quit());
});
