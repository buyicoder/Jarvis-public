#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../../../scripts/lib/config.mjs';
import { capture } from '../../../scripts/lib/lifecycle.mjs';

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

function loopbackUrl(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) && url.protocol === 'http:' ? url.origin : null;
  } catch { return null; }
}

export async function discoverRuntime(env = process.env) {
  const direct = loopbackUrl(env.JARVIS_RUNTIME_URL);
  if (direct) return { available: true, url: direct, token: env.JARVIS_RUNTIME_TOKEN || '', source: 'environment' };
  const status = await readJson(env.JARVIS_RUNTIME_STATUS_FILE || CONFIG.runtimeStatusFile);
  const discovered = loopbackUrl(status?.api);
  if (discovered) return { available: true, url: discovered, token: status.token || '', source: 'status_file' };
  return { available: false, status: 'unavailable', reason: 'runtime_not_discovered' };
}

async function getRuntime(path, { env, fetchImpl = globalThis.fetch } = {}) {
  const runtime = await discoverRuntime(env);
  if (!runtime.available) throw new Error('Jarvis runtime unavailable. Start the desktop app or set a loopback JARVIS_RUNTIME_URL.');
  try {
    const response = await fetchImpl(`${runtime.url}${path}`, { headers: { 'x-jarvis-token': runtime.token }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch (error) {
    throw new Error(`Jarvis runtime unavailable: ${error.message}`);
  }
}

export async function runJarvisClient(argv = process.argv.slice(2), options = {}) {
  const [command = 'help', ...rest] = argv;
  if (command === 'help') return 'Usage: jarvis-client <brief|risk|memory-context|capture|handoff> [text]';
  if (['capture', 'handoff'].includes(command)) {
    const text = rest.join(' ').trim();
    const path = await capture(text, { capturesDir: options.capturesDir || CONFIG.capturesDir, type: command });
    return `Captured as raw input pending review; path=${path}`;
  }
  if (command === 'brief') return JSON.stringify(await getRuntime('/api/status', options), null, 2);
  if (command === 'risk' || command === 'memory-context') return JSON.stringify(await getRuntime('/api/war-room', options), null, 2);
  throw new Error(`Unknown Jarvis plugin command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runJarvisClient().then((output) => console.log(output)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
