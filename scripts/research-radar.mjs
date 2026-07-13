#!/usr/bin/env node
import { CONFIG } from './lib/config.mjs';
import { runResearchRadar } from './lib/research-radar.mjs';

const result = await runResearchRadar({
  scansDir: CONFIG.scansDir,
  network: process.argv.includes('--network'),
});
console.log(JSON.stringify(result, null, 2));
if (result.status === 'partial') process.exitCode = 2;
