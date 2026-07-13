#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONFIG } from './lib/config.mjs';

const today = new Date().toISOString().slice(0, 10);
const outputDir = resolve(CONFIG.scansDir, 'research-radar');
const queries = [
  'local-first agent memory',
  'hybrid search RAG BM25 vector',
  'privacy preserving personal knowledge base',
];

async function searchGitHub(query) {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', `${query} created:>2025-01-01`);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('per_page', '5');
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub search failed: ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).map((item) => ({
    name: item.full_name,
    url: item.html_url,
    description: item.description || '',
    stars: item.stargazers_count,
    query,
  }));
}

async function searchArxiv() {
  const response = await fetch('https://export.arxiv.org/api/query?search_query=all:%22agent%20memory%22&sortBy=submittedDate&max_results=5');
  if (!response.ok) throw new Error(`ArXiv search failed: ${response.status}`);
  const xml = await response.text();
  return xml.split('<entry>').slice(1).map((entry) => ({
    name: entry.match(/<title>([\s\S]*?)<\/title>/)?.[1].replace(/\s+/g, ' ').trim() || 'Untitled paper',
    url: entry.match(/<id>(.*?)<\/id>/)?.[1] || '',
    description: entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].replace(/\s+/g, ' ').trim() || '',
    source: 'ArXiv',
  }));
}

async function searchHuggingFace() {
  const response = await fetch('https://huggingface.co/api/daily_papers?limit=10');
  if (!response.ok) throw new Error(`Hugging Face search failed: ${response.status}`);
  const payload = await response.json();
  return payload.filter((item) => /memory|retrieval|agent|search/i.test(`${item.title} ${item.paper?.summary || ''}`)).slice(0, 5).map((item) => ({
    name: item.title,
    url: `https://huggingface.co/papers/${item.paper?.id || ''}`,
    description: item.paper?.summary || '',
    source: 'Hugging Face Daily Papers',
  }));
}

function assessment(item) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  const relevance = ['memory', 'retrieval', 'search', 'privacy', 'agent'].filter((term) => text.includes(term));
  return relevance.length ? `review: ${relevance.join(', ')}` : 'low direct relevance';
}

const settled = await Promise.allSettled([...queries.map(searchGitHub), searchArxiv(), searchHuggingFace()]);
const items = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
const unique = [...new Map(items.map((item) => [item.url, item])).values()];
const failures = settled.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
const lines = [
  '---',
  `date: ${today}`,
  'source: GitHub public search',
  `candidate_count: ${unique.length}`,
  '---',
  '',
  '# Research radar',
  '',
  '> Discovery only. Review candidates before adopting anything.',
  '',
  ...unique.map((item) => `- [${item.name}](${item.url}) — ${item.description} (${item.source || 'GitHub'}${item.stars === undefined ? '' : `; ${item.stars} stars`}; ${assessment(item)})`),
  ...(failures.length ? ['', '## Collection gaps', '', ...failures.map((failure) => `- ${failure}`)] : []),
  '',
];
await mkdir(outputDir, { recursive: true });
const output = resolve(outputDir, `${today}-radar.md`);
await writeFile(output, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ output, candidates: unique.length, failures }, null, 2));
