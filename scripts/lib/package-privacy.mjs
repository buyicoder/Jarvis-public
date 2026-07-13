import { cp, lstat, mkdir, readlink, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const PUBLIC_SCHEMA_ALLOWLIST = [
  'memory/_schemas/daily-template.md',
  'memory/_schemas/glossary.md',
  'memory/_schemas/proposal-example.json',
];

const FORBIDDEN_PATHS = [
  /(?:^|\/)runtime(?:\/|$)/i,
  /(?:^|\/)(?:control\.db|[^/]+\.(?:db|sqlite|sqlite3))(?:$|\/)/i,
  /(?:^|\/)\.env(?:\.|$)/i,
  /(?:^|\/)memory\/(?:core|daily|captures|proposals|conversations|scans|financial|archive)(?:\/|$)/i,
  /(?:^|\/)(?:reports?|ledger|roster|threads?|sessions?|cookies?|server-inventory)(?:\/|\.|-|$)/i,
  /(?:^|\/)[^/]+\.(?:png|jpe?g|gif|webp|pdf)$/i,
  /(?:^|\/)[^/]+\.(?:pem|key|p12|pfx)$/i,
];

async function walk(root, current = root) {
  const files = [];
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(current, entry.name);
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      const target = resolve(dirname(path), await readlink(path));
      const rel = relative(join(root, 'node_modules'), target);
      if (!relativePath.startsWith('node_modules/.bin/') || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Package boundary rejects symlink: ${relativePath}`);
      files.push(relativePath);
    }
    else if (info.isDirectory()) files.push(...await walk(root, path));
    else if (info.isFile()) files.push(relativePath);
    else throw new Error(`Package boundary rejects special file: ${relativePath}`);
  }
  return files;
}

export async function copySanitizedSchemas(sourceRoot, targetRoot) {
  for (const relativePath of PUBLIC_SCHEMA_ALLOWLIST) {
    const source = join(sourceRoot, relativePath);
    const target = join(targetRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
  return PUBLIC_SCHEMA_ALLOWLIST;
}

export async function assertPublicBundle(root) {
  const files = await walk(root);
  for (const file of files) {
    if (file.startsWith('node_modules/')) continue;
    const forbidden = FORBIDDEN_PATHS.find((pattern) => pattern.test(file));
    if (forbidden) throw new Error(`Forbidden package path: ${file}`);
    if (file.startsWith('memory/') && !PUBLIC_SCHEMA_ALLOWLIST.includes(file)) throw new Error(`Forbidden package path: ${file}`);
  }
  return { ok: true, root, files };
}

export const packagePrivacyInternals = { FORBIDDEN_PATHS, walk };
