import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import matter from 'gray-matter';
import { CONFIG } from './config.mjs';

/** 确保目录存在 */
function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

/**
 * 写入带 frontmatter 的 markdown 文件
 */
export function writeMarkdown(filePath, frontmatter, body) {
  ensureDir(dirname(filePath));
  // Use gray-matter's stringify for proper YAML formatting (handles arrays, etc.)
  const content = matter.stringify(body, frontmatter);
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * 读取 markdown 文件，解析 frontmatter
 * @returns {{ data: object, content: string } | null}
 */
export function readMarkdown(filePath) {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = matter(raw);
  return { data: parsed.data, content: parsed.content };
}

/**
 * 将 markdown 内容按 ## 标题分块（SCAR 启发：语义连续性感知）
 * 相邻段落如果词汇重叠度高，合并为一个 chunk，防止内容碎片化
 * @param {string} content - 去掉 frontmatter 后的正文
 * @param {object} baseMeta - 基础元数据
 * @returns {Array<{chunk_id: string, content: string, metadata: object}>}
 */
export function chunkMarkdown(content, baseMeta = {}) {
  const sections = content.split(/\n(?=## )/).map(s => s.trim()).filter(s => s.length > 0);
  if (!sections.length) return [];

  // Phase 1: 语义连续性检测——相邻段落词汇重叠度 > 30% 则合并
  const merged = [sections[0]];
  for (let i = 1; i < sections.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sections[i];
    const overlap = wordOverlap(prev, curr);
    const combinedLen = prev.length + curr.length;

    if (overlap > 0.3 && combinedLen < CONFIG.chunkMaxChars * 1.5) {
      merged[merged.length - 1] = prev + '\n\n' + curr;
    } else {
      merged.push(curr);
    }
  }

  // Phase 2: 长度裁剪——过短丢弃，过长按段落再分
  const chunks = [];
  merged.forEach((section, i) => {
    const trimmed = section.trim();
    if (trimmed.length < CONFIG.chunkMinChars) return;

    if (trimmed.length > CONFIG.chunkMaxChars) {
      const paragraphs = trimmed.split(/\n\n+/);
      let current = '';
      let subIdx = 0;

      paragraphs.forEach(p => {
        if ((current + p).length > CONFIG.chunkMaxChars && current.length > 0) {
          chunks.push(makeChunk(baseMeta, current.trim(), `${i}-${subIdx}`));
          current = p;
          subIdx++;
        } else {
          current = current ? `${current}\n\n${p}` : p;
        }
      });
      if (current.trim().length >= CONFIG.chunkMinChars) {
        chunks.push(makeChunk(baseMeta, current.trim(), `${i}-${subIdx}`));
      }
    } else {
      chunks.push(makeChunk(baseMeta, trimmed, `${i}`));
    }
  });

  // Phase 3: 质量评分——每个 chunk 标记自含性
  return chunks.map(c => ({
    ...c,
    metadata: {
      ...c.metadata,
      quality: scoreChunkQuality(c.content),
    },
  }));
}

/** 词汇重叠度（简化 Jaccard） */
function wordOverlap(a, b) {
  const wordsA = new Set(a.toLowerCase().match(/[一-鿿\w]+/g) || []);
  const wordsB = (b.toLowerCase().match(/[一-鿿\w]+/g) || []).filter(w => wordsA.has(w));
  return wordsB.length / Math.max(wordsA.size, 1);
}

/** 分块质量评分：0-1，越高越自含 */
function scoreChunkQuality(text) {
  let score = 0.5;
  const len = text.length;
  if (len >= 200 && len <= 1200) score += 0.2;
  if (text.match(/^##?\s/)) score += 0.1;       // 有标题，结构完整
  if (text.match(/[，。；！？]/g)?.length > 3) score += 0.1;  // 有完整句子
  if (text.match(/[一-鿿]{2,}/)) score += 0.1;                 // 含中文
  return Math.min(score, 1.0);
}

function makeChunk(meta, content, suffix) {
  const sourceName = meta.source || 'unknown';
  return {
    chunk_id: `${sourceName.replace(/\//g, '-').replace(/\.md$/, '')}-${suffix}`,
    content,
    metadata: { ...meta },
  };
}

/**
 * 生成日期路径: daily/YYYY/MM/YYYY-MM-DD.md
 */
export function getDailyPath(dateStr) {
  const [year, month] = dateStr.split('-');
  return resolve(CONFIG.dailyDir, year, month, `${dateStr}.md`);
}

/**
 * 追加内容到每日日志（文件不存在则创建）
 */
export function appendToDaily(dateStr, section, lines) {
  const filePath = getDailyPath(dateStr);
  ensureDir(dirname(filePath));

  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf-8');
  } else {
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    // Parse YYYY-MM-DD as local date to avoid timezone offset issues
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayName = dayNames[new Date(y, m - 1, d).getDay()];
    existing = `---\ndate: ${dateStr}\nprojects: []\ntags: []\n---\n\n# ${dateStr} ${dayName}\n\n`;
  }

  const sectionHeader = `\n## ${section}\n`;
  if (!existing.includes(sectionHeader)) {
    existing += sectionHeader;
  }

  const newLines = Array.isArray(lines) ? lines : [lines];
  newLines.forEach(line => {
    if (!existing.includes(line)) {
      existing += `${line}\n`;
    }
  });

  writeFileSync(filePath, existing, 'utf-8');
}
