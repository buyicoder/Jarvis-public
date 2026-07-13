import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertPreviewVersion,
  createBuildInfo,
  renderSha256Sums,
  resolveCleanBuildCommit,
} from '../scripts/lib/release-integrity.mjs';

test('release identity requires the M1 preview version', () => {
  assert.equal(assertPreviewVersion('1.0.0-preview.1'), '1.0.0-preview.1');
  assert.throws(() => assertPreviewVersion('1.0.0'), /1\.0\.0-preview\.1/);
});

test('release manifests bind arm64 artifacts to an explicit commit', () => {
  const artifacts = [
    { file: 'Jarvis-1.0.0-preview.1-arm64.zip', sha256: 'a'.repeat(64), bytes: 12 },
    { file: 'Jarvis-1.0.0-preview.1-arm64.dmg', sha256: 'b'.repeat(64), bytes: 34 },
  ];
  const info = createBuildInfo({
    version: '1.0.0-preview.1',
    commit: '1'.repeat(40),
    arch: 'arm64',
    artifacts,
    createdAt: '2026-07-13T00:00:00.000Z',
  });
  assert.equal(info.commit, '1'.repeat(40));
  assert.equal(info.arch, 'arm64');
  assert.equal(info.signature, 'ad-hoc');
  assert.equal(info.developerIdSigned, false);
  assert.equal(info.notarized, false);
  assert.deepEqual(info.artifacts, artifacts);
  assert.equal(renderSha256Sums(artifacts), `${'a'.repeat(64)}  Jarvis-1.0.0-preview.1-arm64.zip\n${'b'.repeat(64)}  Jarvis-1.0.0-preview.1-arm64.dmg\n`);
});

test('release commit binding rejects mismatched commits and dirty source trees', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-release-git-'));
  try {
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.name', 'Jarvis Release Test']);
    runGit(root, ['config', 'user.email', 'release-test@example.invalid']);
    await writeFile(join(root, 'README.md'), 'release fixture\n');
    runGit(root, ['add', 'README.md']);
    runGit(root, ['commit', '-q', '-m', 'fixture']);
    const head = runGit(root, ['rev-parse', 'HEAD']).trim();
    assert.equal(resolveCleanBuildCommit(root, { JARVIS_BUILD_COMMIT: head }), head);
    assert.throws(
      () => resolveCleanBuildCommit(root, { JARVIS_BUILD_COMMIT: 'f'.repeat(40) }),
      /does not match HEAD/,
    );
    await writeFile(join(root, 'dirty.txt'), 'not committed\n');
    assert.throws(() => resolveCleanBuildCommit(root, { JARVIS_BUILD_COMMIT: head }), /clean worktree/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}
