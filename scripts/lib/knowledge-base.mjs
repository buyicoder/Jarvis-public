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
 * 将 markdown 内容按 ## 标题分块
 * @param {string} content - 去掉 frontmatter 后的正文
 * @param {object} baseMeta - 基础元数据
 * @returns {Array<{chunk_id: string, content: string, metadata: object}>}
 */
export function chunkMarkdown(content, baseMeta = {}) {
  const chunks = [];
  const sections = content.split(/\n(?=## )/);

  sections.forEach((section, i) => {
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

  return chunks;
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
