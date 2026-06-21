/**
 * Claude Code Stop Hook — Jarvis
 * 在会话结束时自动追加 daily 骨架记录
 */
const fs = require('fs');
const path = require('path');

const JARVIS_ROOT = path.resolve(__dirname, '..', '..');
const DAILY_DIR = path.join(JARVIS_ROOT, 'knowledge-base', 'daily');

function getTodayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getDailyPath(dateStr) {
  const [year, month] = dateStr.split('-');
  return path.join(DAILY_DIR, year, month, `${dateStr}.md`);
}

function getDayName(dateStr) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return names[new Date(y, m - 1, d).getDay()];
}

function collectSessionContext() {
  const context = {
    timestamp: new Date().toISOString(),
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || 'unknown',
    projectDir: process.env.CLAUDE_CODE_PROJECT_DIR || process.cwd(),
    exitCode: process.env.CLAUDE_CODE_EXIT_CODE || '0',
  };

  context.projectName = path.basename(context.projectDir);

  try {
    const { execSync } = require('child_process');
    const gitDir = context.projectDir;

    const isGitRepo = (() => {
      try {
        execSync('git rev-parse --git-dir', { cwd: gitDir, stdio: 'ignore' });
        return true;
      } catch { return false; }
    })();

    if (isGitRepo) {
      const changedFiles = execSync(
        'git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo ""',
        { cwd: gitDir, encoding: 'utf-8', timeout: 5000 }
      ).trim();
      context.changedFiles = changedFiles ? changedFiles.split('\n').slice(0, 20) : [];
    } else {
      context.changedFiles = [];
    }
  } catch (e) {
    context.changedFiles = [];
  }

  return context;
}

function appendToDaily(dateStr, lines) {
  const filePath = getDailyPath(dateStr);
  const dir = path.dirname(filePath);

  fs.mkdirSync(dir, { recursive: true });

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    content = `---\ndate: ${dateStr}\nprojects: []\ntags: []\n---\n\n# ${dateStr} ${getDayName(dateStr)}\n\n`;
  }

  const sectionHeader = `\n## 开发\n`;
  if (!content.includes(sectionHeader)) {
    content += sectionHeader;
  }

  const newLines = Array.isArray(lines) ? lines : [lines];
  newLines.forEach(line => {
    if (!content.includes(line)) {
      content += `${line}\n`;
    }
  });

  fs.writeFileSync(filePath, content, 'utf-8');
}

try {
  const ctx = collectSessionContext();

  if (ctx.projectName === 'Jarvis' || ctx.projectName === 'jarvis') {
    process.exit(0);
  }

  const dateStr = getTodayStr();
  const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  const lines = [
    `### ${ctx.projectName}`,
    `- [${timeStr}] 会话结束 — 项目路径: \`${ctx.projectDir}\``,
  ];

  if (ctx.changedFiles && ctx.changedFiles.length > 0) {
    lines.push(`- 修改文件: ${ctx.changedFiles.slice(0, 10).join(', ')}`);
    if (ctx.changedFiles.length > 10) {
      lines.push(`  ... 共 ${ctx.changedFiles.length} 个文件`);
    }
  }

  appendToDaily(dateStr, lines);

  console.log(`[Jarvis Hook] ✅ 已记录到 daily/${dateStr}.md (${ctx.projectName})`);

  // 自动向量化今日内容
  try {
    const { execSync } = require('child_process');
    const indexPath = path.join(JARVIS_ROOT, 'scripts', 'index-daily.mjs');
    execSync(`node "${indexPath}" ${dateStr}`, {
      cwd: JARVIS_ROOT,
      timeout: 30000,
      stdio: 'pipe'
    });
    console.log(`[Jarvis Hook] 🧠 已向量化 daily/${dateStr}.md`);
  } catch (idxErr) {
    console.error('[Jarvis Hook] ⚠️ 向量化失败:', idxErr.message);
  }
} catch (err) {
  console.error('[Jarvis Hook] ⚠️ 记录失败:', err.message);
  process.exit(0);
}
