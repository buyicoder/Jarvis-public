#!/usr/bin/env node
import { resolve } from 'path';
import { CONFIG } from './lib/config.mjs';
import { listRepos, classifyRepo, getReadme, getRepoContents } from './lib/github-client.mjs';
import { writeMarkdown, chunkMarkdown } from './lib/knowledge-base.mjs';
import { clearAll, upsertChunks } from './lib/vector-store.mjs';
import { buildVocabulary } from './lib/embedding.mjs';

async function main() {
  console.log('🔍 正在获取 GitHub 仓库列表...');
  const repos = await listRepos();
  console.log(`  找到 ${repos.length} 个仓库\n`);

  // 分类
  const categorized = { active: [], paused: [], archived: [], idea: [] };
  for (const repo of repos) {
    const cat = classifyRepo(repo);
    categorized[cat].push(repo);
  }

  console.log('📊 分类结果:');
  for (const [cat, list] of Object.entries(categorized)) {
    console.log(`  ${cat}: ${list.length} 个`);
  }
  console.log('');

  // 逐项目生成摘要
  const allChunks = [];
  let idx = 0;

  for (const [cat, list] of Object.entries(categorized)) {
    for (const repo of list) {
      idx++;
      const name = repo.name;
      console.log(`[${idx}/${repos.length}] 📝 ${name} (${cat})`);

      // 拉取 README 和目录结构
      const readme = await getReadme(name);
      const contents = await getRepoContents(name);

      // 提取技术栈信号
      const techSignals = detectTechStack(contents, repo.language);

      // 生成摘要正文（不含 frontmatter）
      const body = buildProjectBody(repo, readme, contents, techSignals, cat);

      // 写入 markdown
      const frontmatter = {
        name: repo.name,
        repo: `${CONFIG.githubUsername}/${repo.name}`,
        updated: repo.updated_at.slice(0, 10),
        status: cat,
        tags: [...repo.topics, repo.language].filter(Boolean),
      };

      const filePath = resolve(CONFIG.projectsDir, `${name}.md`);
      writeMarkdown(filePath, frontmatter, body);

      // 分块用于向量化
      const chunks = chunkMarkdown(body, {
        source: `projects/${name}.md`,
        project: name,
        date: repo.updated_at.slice(0, 10),
        type: 'project_summary',
      });
      allChunks.push(...chunks);

      // 避免 API 限流
      await sleep(200);
    }
  }

  // 生成索引页
  console.log('\n📋 生成项目索引...');
  const indexBody = buildIndexPage(categorized);
  writeMarkdown(CONFIG.projectsIndex, { updated: new Date().toISOString().slice(0, 10) }, indexBody);

  // 向量化 — 先构建全局词表，再嵌入
  console.log(`\n🧠 构建词表 + 向量化 ${allChunks.length} 个 chunks...`);
  const allTexts = allChunks.map(c => c.content);
  buildVocabulary(allTexts);
  await clearAll();
  const result = await upsertChunks(allChunks);
  console.log(`  已索引 ${result.inserted} 个 chunks`);

  console.log('\n✅ Bootstrap 完成！');
  console.log(`   项目摘要: ${CONFIG.projectsDir}/`);
  console.log(`   项目索引: ${CONFIG.projectsIndex}`);
  console.log(`   向量库:   ${CONFIG.vectorDbDir}/`);
}

function detectTechStack(contents, language) {
  const fileNames = contents.map(c => c.name).join(' ');
  const tech = [];

  if (language) tech.push(language);
  if (fileNames.includes('package.json')) tech.push('Node.js');
  if (fileNames.includes('tsconfig.json')) tech.push('TypeScript');
  if (fileNames.includes('next.config.js') || fileNames.includes('next.config.mjs')) tech.push('Next.js');
  if (fileNames.includes('Cargo.toml')) tech.push('Rust');
  if (fileNames.includes('go.mod')) tech.push('Go');
  if (fileNames.includes('requirements.txt') || fileNames.includes('pyproject.toml')) tech.push('Python');
  if (fileNames.includes('Dockerfile')) tech.push('Docker');
  if (fileNames.includes('prisma')) tech.push('Prisma');

  return [...new Set(tech)];
}

function buildProjectBody(repo, readme, contents, techSignals, cat) {
  const parts = [];

  parts.push(`# ${repo.name}\n`);

  // 一句话描述
  const desc = repo.description || extractFirstParagraph(readme) || '(无描述)';
  parts.push('## 一句话描述');
  parts.push(`${desc}\n`);

  // 技术栈
  if (techSignals.length > 0) {
    parts.push('## 技术栈');
    parts.push(techSignals.map(t => `- ${t}`).join('\n'));
    parts.push('');
  }

  // 目录结构（前 20 项）
  if (contents.length > 0) {
    parts.push('## 顶层目录');
    parts.push('```');
    contents.slice(0, 20).forEach(c => {
      parts.push(`${c.type === 'dir' ? '📁' : '📄'} ${c.name}`);
    });
    if (contents.length > 20) parts.push(`... 共 ${contents.length} 项`);
    parts.push('```\n');
  }

  // README 摘要（前 300 字）
  if (readme && readme.length > 10) {
    const summary = readme
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .slice(0, 300)
      .trim();
    if (summary) {
      parts.push('## README 摘要');
      parts.push(`${summary}...\n`);
    }
  }

  // 状态标注
  parts.push('## 状态');
  const statusLabels = {
    active: '🟢 活跃开发中（近 30 天有更新）',
    paused: '🟡 暂停中（30~180 天未更新）',
    archived: '🔴 已归档（超过 180 天未更新）',
    idea: '💡 灵感草稿（无实质代码）',
  };
  parts.push(`${statusLabels[cat]}\n`);

  parts.push('## 当前进度');
  parts.push('_待补充_\n');

  parts.push('## 下次切入要点');
  parts.push('_待补充_\n');

  return parts.join('\n');
}

function extractFirstParagraph(readme) {
  if (!readme) return '';
  const lines = readme.split('\n');
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned && !cleaned.startsWith('#') && !cleaned.startsWith('!') && !cleaned.startsWith('[')) {
      return cleaned.slice(0, 200);
    }
  }
  return '';
}

function buildIndexPage(categorized) {
  const parts = ['# 我的项目速查\n'];
  parts.push(`> 自动生成于 ${new Date().toISOString().slice(0, 10)}，共 ${sumCounts(categorized)} 个项目\n`);

  const sections = [
    ['🟢 活跃开发中', 'active'],
    ['🟡 暂停中', 'paused'],
    ['🔴 已归档', 'archived'],
    ['💡 灵感草稿', 'idea'],
  ];

  for (const [label, key] of sections) {
    parts.push(`## ${label} (${categorized[key].length}个)\n`);
    for (const repo of categorized[key]) {
      const desc = repo.description ? repo.description.slice(0, 80) : '(无描述)';
      parts.push(`- **${repo.name}** — ${desc}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function sumCounts(categorized) {
  return Object.values(categorized).reduce((s, l) => s + l.length, 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('❌ Bootstrap 失败:', err.message);
  process.exit(1);
});
