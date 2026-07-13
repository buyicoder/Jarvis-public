import * as lancedb from '@lancedb/lancedb';
import natural from 'natural';
const { TfIdf } = natural;
import { CONFIG } from './config.mjs';
import { embed } from './embedding.mjs';

let _db = null;
let _bm25Index = null; // BM25 关键词索引（LanceDB FTS 不可用时的回退）
let _table = null;

/** 获取或初始化 LanceDB 连接 */
async function getDb() {
  if (_db) return _db;
  const { mkdirSync } = await import('fs');
  mkdirSync(CONFIG.vectorDbDir, { recursive: true });
  _db = await lancedb.connect(CONFIG.vectorDbDir);
  return _db;
}

/** 获取或创建表 */
async function getTable() {
  if (_table) return _table;
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes(CONFIG.tableName)) {
    _table = await db.openTable(CONFIG.tableName);
    return _table;
  }
  // 表不存在时返回 null，由 upsertChunks 用首批数据创建
  return null;
}

/**
 * 将 chunks 写入向量库
 * @param {Array<{chunk_id: string, content: string, metadata: object}>} chunks
 */
export async function upsertChunks(chunks) {
  if (chunks.length === 0) return { inserted: 0 };

  const texts = chunks.map(c => c.content);
  const vectors = await embed(texts);

  const rows = chunks.map((chunk, i) => ({
    chunk_id: chunk.chunk_id,
    content: chunk.content,
    vector: vectors[i],
    source: chunk.metadata.source || '',
    project: chunk.metadata.project || '',
    date: chunk.metadata.date || '',
    type: chunk.metadata.type || '',
    importance: chunk.metadata.importance || 'medium',
  }));

  const db = await getDb();
  const tableNames = await db.tableNames();

  if (!tableNames.includes(CONFIG.tableName)) {
    // 用首批数据创建表（LanceDB 从数据推断 schema）
    _table = await db.createTable(CONFIG.tableName, rows);
  } else {
    if (!_table) _table = await db.openTable(CONFIG.tableName);
    await _table.add(rows);
  }

  return { inserted: rows.length };
}

/** 写入 chunks 并确保全文索引就绪 */
export async function upsertChunksWithIndex(chunks) {
  const result = await upsertChunks(chunks);
  if (result.inserted > 0) {
    await ensureFTSIndex();
    // 同时构建本地 BM25 回退索引
    const table = await getTable();
    if (table) {
      try {
        const all = await table.search([0.5]).limit(9999).toArray();
        rebuildBM25(all);
      } catch {}
    }
  }
  return result;
}

/**
 * 语义搜索（向量 + BM25 混合，带时间衰减）
 * @param {string} queryText
 * @returns {Promise<Array<{chunk_id: string, content: string, source: string, _distance: number, date: string}>>}
 */
export async function search(queryText) {
  const table = await getTable();
  if (!table) return [];

  const queryVec = (await embed([queryText]))[0];
  const candidates = await table.search(queryVec).limit(CONFIG.searchTopK * 3).toArray();

  // === 混合搜索：向量 + BM25 全文检索 ===
  let bm25Results = [];
  try {
    bm25Results = await table.search(queryText, 'fts').limit(CONFIG.searchTopK).toArray();
  } catch (_) {
    // LanceDB FTS 不可用 → 回退到本地 BM25
    if (_bm25Index) {
      bm25Results = bm25Search(queryText);
    }
  }

  // Reciprocal Rank Fusion
  const fused = fuseResults(candidates, bm25Results, CONFIG.searchTopK * 3);
  fused.sort((a, b) => a._distance - b._distance);
  return fused.slice(0, CONFIG.searchTopK);
}

/** 本地 BM25 关键词搜索（LanceDB FTS 回退） */
function bm25Search(queryText) {
  if (!_bm25Index) return [];
  const terms = queryText.toLowerCase().split(/\s+/);
  const scores = [];
  _bm25Index.documents.forEach((doc, idx) => {
    let score = 0;
    terms.forEach(term => {
      try { score += _bm25Index.tfidf(term, idx); } catch {}
    });
    if (score > 0) scores.push({ ...doc, _bm25Score: score, idx });
  });
  scores.sort((a, b) => b._bm25Score - a._bm25Score);
  return scores.slice(0, CONFIG.searchTopK).map(s => ({
    chunk_id: s.chunk_id, content: s.content, source: s.source,
    _distance: 1.5 - Math.min(s._bm25Score / 10, 0.5),
  }));
}

/** 构建/更新 BM25 索引 */
function rebuildBM25(allChunks) {
  if (allChunks.length === 0) return;
  _bm25Index = { tfidf: new TfIdf(), documents: allChunks };
  allChunks.forEach(c => _bm25Index.tfidf.addDocument(c.content));
}

/** RRF 融合：向量排名 + 关键词排名 → 综合排名 */
function fuseResults(vectorResults, bm25Results, limit) {
  const scores = new Map();

  // 向量分数（L2距离越小越好 → 排名越小越好）
  vectorResults.forEach((r, i) => {
    const id = r.chunk_id || r.source + '-' + i;
    scores.set(id, { ...r, _score: 1 / (i + 60), _distance: r._distance });
  });

  // BM25 分数
  bm25Results.forEach((r, i) => {
    const id = r.chunk_id || r.source + '-' + i;
    const existing = scores.get(id);
    if (existing) {
      existing._score += 1 / (i + 60);
      // BM25 命中让向量距离减半（权重更高）
      existing._distance *= 0.5;
    } else {
      scores.set(id, { ...r, _score: 1 / (i + 60), _distance: 1.5 });
    }
  });

  const fused = [...scores.values()];

  // 时间衰减
  const now = new Date();
  fused.forEach(r => {
    let timeFactor = 1.0;
    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        const daysAgo = (now - d) / 86400000;
        if (daysAgo <= 30) timeFactor = 1.0;
        else if (daysAgo <= 90) timeFactor = 0.8;
        else timeFactor = 0.5;
      }
    }
    const impFactor = r.importance === 'high' ? 1.2 : r.importance === 'low' ? 0.8 : 1.0;
    r._distance = r._distance / (timeFactor * impFactor);
  });

  return fused.slice(0, limit);
}

export const vectorStoreInternals = Object.freeze({ fuseResults });

/** 创建全文索引（首次调用时自动创建） */
let _ftsCreated = false;
export async function ensureFTSIndex() {
  if (_ftsCreated) return;
  const table = await getTable();
  if (!table) return;
  try {
    await table.createFtsIndex('content', { replace: true });
    _ftsCreated = true;
    console.log('  📖 BM25 全文索引就绪');
  } catch (e) {
    console.log('  ⚠️ FTS 索引创建失败，使用纯向量搜索:', e.message.slice(0, 60));
  }
}

/**
 * 清空向量库（用于重建）
 */
export async function clearAll() {
  const db = await getDb();
  const tableNames = await db.tableNames();
  if (tableNames.includes(CONFIG.tableName)) {
    await db.dropTable(CONFIG.tableName);
    _table = null;
  }
}
