#!/usr/bin/env node
/** Jarvis 技术雷达 — 搜索最新 AI 技术，评估是否可以用于自我迭代 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname || '.', '..');
const OUT_DIR = resolve(ROOT, 'memory', 'scans', 'research-radar');
const TODAY = new Date().toISOString().slice(0,10);
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const PROXY = process.env.https_proxy || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

// ====== 工具函数 ======

function fetchBlocked(url) {
  try {
    const r = execSync(`curl -s --proxy ${PROXY} --connect-timeout 8 -m 12 "${url}"`, {
      encoding:'utf-8', timeout:15000, maxBuffer:5*1024*1024, windowsHide:true
    });
    return { ok:true, json:()=>JSON.parse(r), text:()=>r };
  } catch(e) { return { ok:false, json:()=>null, text:()=>'' }; }
}

async function askDeepSeek(prompt) {
  if (!DEEPSEEK_KEY) return '没有 DeepSeek key';
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${DEEPSEEK_KEY}`},
    body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],temperature:0.3,max_tokens:2000})
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '评估失败';
}

// ====== 数据采集 ======

// 1. GitHub — 精准查询
async function searchGitHub() {
  const queries = [
    'embedding+model+chinese+lightweight+created:>2026-01-01',
    'hybrid+search+RAG+BM25+vector+created:>2026-01-01',
    'agent+memory+persistent+knowledge+created:>2026-01-01',
  ];
  const results = [];
  for (const q of queries) {
    try {
      const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=5`);
      const data = await res.json();
      (data.items||[]).slice(0,5).forEach(r => results.push({
        title: r.full_name, url: r.html_url, desc: (r.description||'').slice(0,200),
        stars: r.stargazers_count, source: 'GitHub', query: q.replace(/\+/g,' '),
      }));
    } catch(e) {}
  }
  return results;
}

// 2. ArXiv — 检索/嵌入论文
function searchArXiv() {
  const queries = ['ti:dense+retrieval', 'ti:embedding+model+AND+cat:cs.CL', 'ti:RAG+AND+cat:cs.IR'];
  const results = [];
  for (const q of queries) {
    try {
      const res = fetchBlocked(`https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&max_results=3`);
      const text = res.text();
      const entries = text.split('<entry>').slice(1);
      for (const entry of entries) {
        const title = (entry.match(/<title>(.*?)<\/title>/s)||[])[1]?.replace(/\s+/g,' ').trim();
        const summary = (entry.match(/<summary>(.*?)<\/summary>/s)||[])[1]?.slice(0,300);
        const link = (entry.match(/<id>(.*?)<\/id>/)||[])[1];
        if (title) results.push({ title, url: link, desc: summary?.slice(0,200)||'', source: 'ArXiv', query: q });
      }
    } catch(e) {}
  }
  return results;
}

// 3. HuggingFace Daily Papers — 只取和 Jarvis 相关的
function searchHF() {
  try {
    const res = fetchBlocked('https://huggingface.co/api/daily_papers?limit=10');
    const papers = res.json();
    const relevant = ['embedding','retrieval','RAG','memory','agent','search','knowledge'];
    return (papers||[]).filter(p => {
      const t = (p.title||'').toLowerCase();
      return relevant.some(k => t.includes(k));
    }).slice(0,5).map(p => ({
      title: p.title, url: `https://huggingface.co/papers/${p.paper?.id||''}`,
      desc: (p.paper?.summary||'').slice(0,200), upvotes: p.upvotes||0, source: 'HF Daily Papers',
    }));
  } catch(e) { return []; }
}

// ====== AI 评估 ======

async function evaluateFindings(items) {
  if (!items.length) return '本周无相关发现。';

  const prompt = `你是 Jarvis 自我迭代的评估引擎。以下是从 GitHub/ArXiv/HuggingFace 搜索到的可能与 Jarvis 架构相关的技术发现。

Jarvis 当前技术栈：
- 嵌入模型: bge-small-zh-v1.5 (512维，91MB本地ONNX)
- 向量库: LanceDB
- 搜索: 混合搜索 (BM25 + 向量 + RRF融合 + 时间衰减)
- 分块: Markdown按##标题自然分界
- 运行环境: Node.js，Windows本地
- 中文为主

请对每条发现进行四门评估：
1. 相关性：和Jarvis架构有关？(嵌入/搜索/记忆/分块/本地运行)
2. 可实施性：能集成到Node.js本地环境？
3. 收益：如果换，能提升多少？
4. 成本：安装/迁移/学习成本？

输出格式：
| # | 技术 | 来源 | 相关性 | 可实施 | 收益 | 成本 | 建议 |
|---|------|------|--------|--------|------|------|------|
| 1 | xxx | GitHub | 高 | 是 | 30%准确率 | 低 | ⭐推荐关注 |

最后输出一个「本周建议」：是否有关注价值的技术？是否需要手动验证？

原始发现：
${items.map((item,i)=>`
[${i+1}] [${item.source}] ${item.title}
${item.desc||''}
${item.url}
`).join('\n')}`;

  return await askDeepSeek(prompt);
}

// ====== 主流程 ======

async function main() {
  console.log('📡 Jarvis Research Radar — 搜索可改进自身的新技术\n');

  mkdirSync(OUT_DIR, { recursive: true });

  // 1. 采集
  console.log('📥 搜索...');
  const [github, arxiv, hf] = await Promise.all([searchGitHub(), searchArXiv(), searchHF()]);
  const all = [...github, ...arxiv, ...hf];
  console.log(`   GitHub: ${github.length} | ArXiv: ${arxiv.length} | HF: ${hf.length}`);
  console.log(`   共 ${all.length} 条候选\n`);

  // 2. 评估
  console.log('🧠 DeepSeek 四门评估...');
  const report = await evaluateFindings(all);

  // 3. 保存
  const content = `---
date: ${TODAY}
sources: [GitHub, ArXiv, HuggingFace]
total_candidates: ${all.length}
---

${report}
`;
  const outFile = resolve(OUT_DIR, `${TODAY}-radar.md`);
  writeFileSync(outFile, content, 'utf-8');
  console.log(`✅ 雷达报告: memory/scans/research-radar/${TODAY}-radar.md`);
  console.log(`   ${report.length} 字`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
