import * as lancedb from '@lancedb/lancedb';
import { CONFIG } from './config.mjs';
import { embed } from './embedding.mjs';

let _db = null;
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

/**
 * 语义搜索（带时间衰减）
 * @param {string} queryText
 * @returns {Promise<Array<{chunk_id: string, content: string, source: string, _distance: number, date: string}>>}
 */
export async function search(queryText) {
  const queryVec = (await embed([queryText]))[0];

  const table = await getTable();
  if (!table) return [];

  // 多取一些候选，用于时间衰减后重排
  const candidates = await table
    .search(queryVec)
    .limit(CONFIG.searchTopK * 3)
    .toArray();

  // 时间衰减：越近权重越高
  const now = new Date();
  const decayed = candidates.map(r => {
    let timeFactor = 1.0;
    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        const daysAgo = (now - d) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 30) timeFactor = 1.0;
        else if (daysAgo <= 90) timeFactor = 0.8;
        else timeFactor = 0.5;
      }
    }
    // 重要性加权
    const impFactor = r.importance === 'high' ? 1.2 : r.importance === 'low' ? 0.8 : 1.0;
    return { ...r, _distance: r._distance / (timeFactor * impFactor) };
  });

  // 重排后取 top K
  decayed.sort((a, b) => a._distance - b._distance);
  return decayed.slice(0, CONFIG.searchTopK);
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
