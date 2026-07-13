#!/usr/bin/env node
import path from 'node:path';
import { appendToDaily } from '../../scripts/lib/knowledge-base.mjs';
import { localDate } from '../../scripts/lib/lifecycle.mjs';

const now = new Date();
const date = localDate(now);
const project = path.basename(process.env.CLAUDE_CODE_PROJECT_DIR || process.cwd());
const line = `- ${now.toISOString()} session completed: ${project}`;

try {
  appendToDaily(date, 'Sessions', line);
  console.log(`[Jarvis Hook] session recorded in external Vault (${date})`);
} catch (error) {
  console.error(`[Jarvis Hook] record skipped: ${error.message}`);
}
