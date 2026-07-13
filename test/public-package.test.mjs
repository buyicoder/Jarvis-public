import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { assertPublicBundle, copySanitizedSchemas, PUBLIC_SCHEMA_ALLOWLIST } from '../scripts/lib/package-privacy.mjs';

test('package memory contains only exact sanitized schemas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-package-'));
  try {
    const source = join(root, 'source');
    const target = join(root, 'target');
    for (const file of PUBLIC_SCHEMA_ALLOWLIST) {
      await mkdir(join(source, file, '..'), { recursive: true });
      await writeFile(join(source, file), '# synthetic schema\n');
    }
    await copySanitizedSchemas(source, target);
    assert.equal((await assertPublicBundle(target)).files.length, PUBLIC_SCHEMA_ALLOWLIST.length);
    await mkdir(join(target, 'memory', 'core'), { recursive: true });
    await writeFile(join(target, 'memory', 'core', 'identity.md'), 'private');
    await assert.rejects(() => assertPublicBundle(target), /forbidden package path/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('package boundary rejects databases, evidence, env files and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-package-deny-'));
  try {
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(join(root, 'runtime', 'control.db'), 'db');
    await assert.rejects(() => assertPublicBundle(root), /forbidden package path/i);
    await rm(join(root, 'runtime'), { recursive: true, force: true });
    await writeFile(join(root, '.env.local'), 'secret');
    await assert.rejects(() => assertPublicBundle(root), /forbidden package path/i);
    await rm(join(root, '.env.local'));
    await symlink('/private/etc/hosts', join(root, 'linked'));
    await assert.rejects(() => assertPublicBundle(root), /symlink/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
