import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

export const PREVIEW_VERSION = '1.0.0-preview.1';
export const RELEASE_ARCH = 'arm64';
export const BUNDLE_SHORT_VERSION = '1.0.0';
export const BUNDLE_BUILD_VERSION = '10001';

export function assertPreviewVersion(version) {
  if (version !== PREVIEW_VERSION) throw new Error(`Developer Preview version must be ${PREVIEW_VERSION}.`);
  return version;
}

export function resolveCleanBuildCommit(root, env = process.env) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const commit = String(env.JARVIS_BUILD_COMMIT || head).trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('JARVIS_BUILD_COMMIT must be a full 40-character Git SHA.');
  if (commit !== head) throw new Error(`Build commit ${commit} does not match HEAD ${head}.`);
  const dirty = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
  if (dirty) throw new Error(`Release builds require a clean worktree.\n${dirty}`);
  return commit;
}

export async function sha256Artifact(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const info = await stat(path);
  return { sha256: hash.digest('hex'), bytes: info.size };
}

export function createBuildInfo({ version, commit, arch, artifacts, createdAt = new Date().toISOString() }) {
  assertPreviewVersion(version);
  if (arch !== RELEASE_ARCH) throw new Error(`Developer Preview architecture must be ${RELEASE_ARCH}.`);
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('Build commit must be a full Git SHA.');
  return {
    schema: 'jarvis-public-build-info/v1',
    version,
    commit,
    arch,
    signature: 'ad-hoc',
    developerIdSigned: false,
    notarized: false,
    createdAt,
    artifacts,
  };
}

export function renderSha256Sums(artifacts) {
  return `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`).join('\n')}\n`;
}
