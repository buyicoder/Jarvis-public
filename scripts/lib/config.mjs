import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const ROOT_DIR = resolve(__dirname, '..', '..');

export const CONFIG = {
  // 路径 — 分层记忆架构
  rootDir: ROOT_DIR,
  memoryDir: resolve(ROOT_DIR, 'memory'),
  coreDir: resolve(ROOT_DIR, 'memory', 'core'),
  projectsDir: resolve(ROOT_DIR, 'memory', 'core', 'projects'),
  dailyDir: resolve(ROOT_DIR, 'memory', 'daily'),
  archiveDir: resolve(ROOT_DIR, 'memory', 'archive'),
  conversationsDir: resolve(ROOT_DIR, 'memory', 'conversations'),
  scansDir: resolve(ROOT_DIR, 'memory', 'scans'),
  financialDir: resolve(ROOT_DIR, 'memory', 'financial'),
  schemasDir: resolve(ROOT_DIR, 'memory', '_schemas'),
  vectorDbDir: resolve(ROOT_DIR, 'index', 'vector'),
  projectsIndex: resolve(ROOT_DIR, 'memory', 'core', 'projects', '_index.md'),

  // 兼容旧路径
  knowledgeBaseDir: resolve(ROOT_DIR, 'memory'),

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
