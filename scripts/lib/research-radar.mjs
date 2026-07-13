import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const queries = [
  'local-first agent memory',
  'hybrid search RAG BM25 vector',
  'privacy preserving personal knowledge base',
];

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

async function searchGitHub() {
  const results = await Promise.all(queries.map(async (query) => {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', `${query} created:>2025-01-01`);
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('per_page', '5');
    const payload = await getJson(url);
    return (payload.items || []).map((item) => ({
      name: item.full_name,
      url: item.html_url,
      description: item.description || '',
      source: 'GitHub',
    }));
  }));
  return results.flat();
}

async function searchHuggingFace() {
  const payload = await getJson('https://huggingface.co/api/daily_papers?limit=10');
  return payload
    .filter((item) => /memory|retrieval|agent|search/i.test(`${item.title} ${item.paper?.summary || ''}`))
    .slice(0, 5)
    .map((item) => ({
      name: item.title,
      url: `https://huggingface.co/papers/${item.paper?.id || ''}`,
      description: item.paper?.summary || '',
      source: 'Hugging Face',
    }));
}

function sanitize(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function runResearchRadar({
  scansDir,
  network = false,
  collectors = [searchGitHub, searchHuggingFace],
  now = new Date(),
} = {}) {
  if (!network) return { enabled: false, status: 'disabled', writes: false, reason: 'network_opt_in_required' };
  if (!scansDir) throw new Error('scansDir is required');

  const settled = await Promise.allSettled(collectors.map((collect) => collect()));
  const items = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  const failures = settled
    .filter((result) => result.status === 'rejected')
    .map((result) => sanitize(result.reason?.message || result.reason));
  const unique = [...new Map(items.filter((item) => item?.url).map((item) => [item.url, item])).values()];
  const day = now.toISOString().slice(0, 10);
  const outputDir = resolve(scansDir, 'research-radar');
  const output = resolve(outputDir, `${day}-radar.md`);
  const lines = [
    '---',
    `date: ${day}`,
    `candidate_count: ${unique.length}`,
    'discovery_only: true',
    '---',
    '',
    '# Research radar',
    '',
    '> Public discovery only. Review candidates before adopting anything.',
    '',
    ...unique.map((item) => `- [${sanitize(item.name) || 'Untitled'}](${item.url}) — ${sanitize(item.description)} (${sanitize(item.source) || 'public source'})`),
    ...(failures.length ? ['', '## Collection gaps', '', ...failures.map((failure) => `- ${failure}`)] : []),
    '',
  ];
  await mkdir(outputDir, { recursive: true });
  await writeFile(output, lines.join('\n'), 'utf8');
  return { enabled: true, status: failures.length ? 'partial' : 'ok', writes: true, output, candidates: unique.length, failures };
}
