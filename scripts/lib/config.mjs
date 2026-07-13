import { fileURLToPath } from 'url';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { homedir } from 'os';
import { existsSync, realpathSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT_DIR = resolve(__dirname, '..', '..');
const LEGACY_MEMORY_DIR = resolve(ROOT_DIR, 'memory');
const MEMORY_DIR = resolve(
  process.env.JARVIS_MEMORY_DIR
    || process.env.JARVIS_VAULT_DIR
    || (process.env.JARVIS_LEGACY_REPO_MEMORY === '1' ? LEGACY_MEMORY_DIR : resolve(homedir(), '.jarvis', 'vault')),
);
const explicitLegacy = process.env.JARVIS_LEGACY_REPO_MEMORY === '1';
const canonical = (path) => existsSync(path) ? realpathSync.native(path) : resolve(path);
const isInside = (parent, child, normalize = resolve) => {
  const rel = relative(normalize(parent), normalize(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
if (!explicitLegacy && (isInside(ROOT_DIR, MEMORY_DIR) || isInside(ROOT_DIR, MEMORY_DIR, canonical))) {
  throw new Error('Refusing a repository-local Vault. Set an external JARVIS_VAULT_DIR, or explicitly opt into JARVIS_LEGACY_REPO_MEMORY=1.');
}

export const CONFIG = {
  // 路径 — 分层记忆架构
  rootDir: ROOT_DIR,
  memoryDir: MEMORY_DIR,
  isLegacyRepoMemory: MEMORY_DIR === LEGACY_MEMORY_DIR,
  coreDir: resolve(MEMORY_DIR, 'core'),
  projectsDir: resolve(MEMORY_DIR, 'core', 'projects'),
  dailyDir: resolve(MEMORY_DIR, 'daily'),
  archiveDir: resolve(MEMORY_DIR, 'archive'),
  conversationsDir: resolve(MEMORY_DIR, 'conversations'),
  capturesDir: resolve(MEMORY_DIR, 'captures'),
  proposalsDir: resolve(MEMORY_DIR, 'proposals'),
  scansDir: resolve(MEMORY_DIR, 'scans'),
  financialDir: resolve(MEMORY_DIR, 'financial'),
  schemasDir: resolve(ROOT_DIR, 'memory', '_schemas'),
  vectorDbDir: resolve(ROOT_DIR, 'index', 'vector'),
  projectsIndex: resolve(MEMORY_DIR, 'core', 'projects', '_index.md'),

  // 兼容旧路径
  knowledgeBaseDir: MEMORY_DIR,

  // GitHub
  githubUsername: process.env.GITHUB_USERNAME || 'your-username',
  githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',

  // Embedding — 使用本地 Transformers.js 模型，无需外部 API
  // 模型: Xenova/all-MiniLM-L6-v2 (384维，轻量)

  // Chunk 策略
  chunkMaxChars: 1000,
  chunkMinChars: 200,

  // 查询
  searchTopK: 5,

  // LanceDB 表名
  tableName: 'knowledge_chunks',
};
