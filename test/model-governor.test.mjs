import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendRoute } from '../scripts/lib/model-governor.mjs';

test('routes routine work to fast in recommendation-only mode', () => {
  assert.deepEqual(recommendRoute({ complexity: 1, risk: 'low' }), {
    schema: 'jarvis-public-model-route/v1', mode: 'recommendation_only', tier: 'fast', reasons: ['routine_task'], allowedTiers: ['fast', 'balanced', 'deep'],
  });
});

test('high-risk work recommends deep but never max or ultra', () => {
  const route = recommendRoute({ complexity: 5, risk: 'high' });
  assert.equal(route.tier, 'deep');
  assert.ok(!JSON.stringify(route).match(/ultra|max/i));
});

test('tight budget caps non-critical deep work', () => {
  const route = recommendRoute({ complexity: 5, risk: 'high', budget: 'tight' });
  assert.equal(route.tier, 'balanced');
  assert.ok(route.reasons.includes('budget_cap'));
});
