import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { auditTokenTelemetry, evaluateRoutingFixtures, explainRoute, routeTask, writeShadowObservation } from '../scripts/lib/model-governor.mjs';

const fixtures = Array.from({ length: 30 }, (_, index) => ({
  name: `fixture-${index + 1}`,
  input: { complexity: (index % 5) + 1, risk: ['low', 'medium', 'high'][index % 3], budget: index % 4 === 0 ? 'tight' : 'normal', taskType: index % 2 ? 'analysis' : 'mechanical' },
}));

test('routing policy is deterministic, recommendation-only and ultra is prohibited', () => {
  const first = routeTask({ complexity: 4, risk: 'high', taskType: 'analysis' });
  const second = routeTask({ complexity: 4, risk: 'high', taskType: 'analysis' });
  assert.deepEqual(first, second);
  assert.equal(first.applyAutomatically, false);
  assert.notEqual(first.reasoningEffort, 'ultra');
  assert.equal(routeTask({ complexity: 5, risk: 'critical', requestedEffort: 'ultra' }).reasoningEffort, 'high');
});

test('max requires the complete critical budget and stop-condition gate', () => {
  assert.notEqual(routeTask({ complexity: 5, risk: 'critical', maxRequested: true }).reasoningEffort, 'max');
  const route = routeTask({
    complexity: 5, risk: 'critical', budget: 'flexible', taskType: 'security_review',
    maxRequested: true, priorFailedAttempts: 2, irreversible: true, blastRadius: 'high',
    requiresSecurityJudgment: true, maxReason: 'Critical release boundary', tokenBudget: 120000,
    stopCondition: 'Stop after release decision evidence is complete.',
  });
  assert.equal(route.reasoningEffort, 'max');
  assert.equal(route.applyAutomatically, false);
  assert.equal(explainRoute(route).unmetMaxConditions.length, 0);
});

test('30 fixture evaluation is stable and mechanical tasks never use max', () => {
  const result = evaluateRoutingFixtures(fixtures);
  assert.equal(result.total, 30);
  assert.equal(result.violations.length, 0);
  assert.equal(result.promotionEligible, false);
});

test('default evaluation exposes the complete public fixture suite', () => {
  const result = evaluateRoutingFixtures();
  assert.equal(result.total, 30);
  assert.equal(result.violations.length, 0);
});

test('shadow observations omit prompts and sensitive max justification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-model-shadow-'));
  try {
    const path = join(root, 'shadow.jsonl');
    await writeShadowObservation(path, { taskId: 'synthetic-1', projectId: 'demo', prompt: 'private prompt', maxReason: 'sensitive reason', route: routeTask({ complexity: 2, risk: 'low' }) });
    const content = await readFile(path, 'utf8');
    assert.doesNotMatch(content, /private prompt|sensitive reason/);
    assert.match(content, /synthetic-1/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('token audit stores local usage telemetry, not billing or prompt text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jarvis-public-token-'));
  try {
    const path = join(root, 'usage.jsonl');
    await writeFile(path, [
      JSON.stringify({ projectId: 'demo', usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 3 }, prompt: 'do not read this' }),
      JSON.stringify({ projectId: 'demo', message: 'ignored content' }),
    ].join('\n'));
    const audit = await auditTokenTelemetry([path]);
    assert.equal(audit.label, 'local usage telemetry, not billing');
    assert.deepEqual(audit.totals, { inputTokens: 10, outputTokens: 5, cachedTokens: 3 });
    assert.doesNotMatch(JSON.stringify(audit), /do not read this|ignored content/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
