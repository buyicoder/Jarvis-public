import { pipeline } from '@huggingface/transformers';
import { resolve } from 'path';

let _extractor = null;

/** 懒加载 embedding pipeline — 使用本地模型文件 */
async function getExtractor() {
  if (_extractor) return _extractor;

  const modelPath = resolve(import.meta.dirname || '.', '..', '..', 'index', 'models', 'bge-small-zh-v1.5');

  console.log('  Loading bge-small-zh-v1.5 from local...');
  _extractor = await pipeline('feature-extraction', modelPath);
  console.log('  ✅ Model loaded');

  return _extractor;
}

/**
 * 使用 BGE-small-zh 模型将文本转为向量
 * @param {string|string[]} texts
 * @returns {Promise<number[][]>} - 512维向量数组
 */
export async function embed(texts) {
  const extractor = await getExtractor();
  const inputs = Array.isArray(texts) ? texts : [texts];

  const results = [];
  for (const text of inputs) {
    const output = await extractor(text.slice(0, 8000), { pooling: 'mean', normalize: true });
    results.push(Array.from(output.data));
  }

  return results;
}

export async function embedOne(text) {
  const results = await embed([text]);
  return results[0];
}

// 移除 buildVocabulary — embedding 模型不需要预构建词表
export function buildVocabulary() {
  console.log('  使用 bge-small-zh-v1.5 embedding，无需预构建词表');
}
