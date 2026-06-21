import { CONFIG } from './config.mjs';

const API_BASE = 'https://api.github.com';

/** 构建请求头，包含可选的 GitHub token */
function getHeaders() {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (CONFIG.githubToken) {
    headers['Authorization'] = `Bearer ${CONFIG.githubToken}`;
  }
  return headers;
}

/**
 * 获取用户所有公开仓库（不鉴权，公开仓库即可）
 */
export async function listRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const url = `${API_BASE}/users/${CONFIG.githubUsername}/repos?per_page=100&page=${page}&sort=updated`;
    const response = await fetch(url, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.length === 0) break;

    repos.push(...data.map(r => ({
      name: r.name,
      description: r.description || '',
      language: r.language || '',
      topics: r.topics || [],
      updated_at: r.updated_at,
      html_url: r.html_url,
      default_branch: r.default_branch,
    })));

    page++;
  }

  return repos;
}

/**
 * 获取仓库 README 内容
 * @returns {Promise<string>}
 */
export async function getReadme(repoName) {
  const url = `${API_BASE}/repos/${CONFIG.githubUsername}/${repoName}/readme`;
  const response = await fetch(url, {
    headers: { ...getHeaders(), 'Accept': 'application/vnd.github.v3.raw' },
  });

  if (response.status === 404) return '';
  if (!response.ok) {
    console.error(`  ⚠️ 无法获取 ${repoName} 的 README: ${response.status}`);
    return '';
  }
  return await response.text();
}

/**
 * 获取仓库顶层目录结构
 */
export async function getRepoContents(repoName) {
  const url = `${API_BASE}/repos/${CONFIG.githubUsername}/${repoName}/contents`;
  const response = await fetch(url, {
    headers: getHeaders(),
  });

  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data)) return [];

  return data.map(item => ({
    name: item.name,
    type: item.type,
  }));
}

/**
 * 仓库分类
 * @returns {'active'|'paused'|'archived'|'idea'}
 */
export function classifyRepo(repo) {
  const daysSinceUpdate = (Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24);

  // 无描述且无语言的仓库视为灵感草稿，无论时间
  if (!repo.description && !repo.language) return 'idea';

  if (daysSinceUpdate <= 30) return 'active';
  if (daysSinceUpdate <= 180) return 'paused';
  return 'archived';
}
