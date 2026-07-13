import { createReadStream } from 'node:fs';
import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

const TIERS = ['fast', 'balanced', 'deep'];
const MAX_CONDITIONS = [
  ['critical_risk', (value) => value.risk === 'critical'],
  ['flexible_budget', (value) => value.budget === 'flexible'],
  ['two_prior_failures', (value) => Number(value.priorFailedAttempts) >= 2],
  ['irreversible', (value) => value.irreversible === true],
  ['high_blast_radius', (value) => value.blastRadius === 'high'],
  ['security_or_release_judgment', (value) => value.requiresSecurityJudgment === true || value.requiresReleaseJudgment === true],
  ['explicit_reason', (value) => Boolean(String(value.maxReason || '').trim())],
  ['token_budget', (value) => Number(value.tokenBudget) > 0],
  ['stop_condition', (value) => Boolean(String(value.stopCondition || '').trim())],
];

function normalized(input = {}) {
  const complexity = Number(input.complexity || 1);
  const risk = String(input.risk || 'low').toLowerCase();
  const budget = String(input.budget || 'normal').toLowerCase();
  if (!Number.isInteger(complexity) || complexity < 1 || complexity > 5) throw new Error('complexity must be an integer from 1 to 5.');
  if (!['low', 'medium', 'high', 'critical'].includes(risk)) throw new Error('risk must be low, medium, high, or critical.');
  if (!['tight', 'normal', 'flexible'].includes(budget)) throw new Error('budget must be tight, normal, or flexible.');
  return { ...input, complexity, risk, budget, taskType: String(input.taskType || 'general') };
}

export function recommendRoute(input = {}) {
  const value = normalized(input);
  let tier = 'fast';
  const reasons = [];
  if (value.complexity >= 4 || ['high', 'critical'].includes(value.risk)) {
    tier = 'deep';
    if (value.complexity >= 4) reasons.push('high_complexity');
    if (['high', 'critical'].includes(value.risk)) reasons.push(value.risk === 'critical' ? 'critical_risk' : 'high_risk');
  } else if (value.complexity >= 2 || value.risk === 'medium') {
    tier = 'balanced';
    reasons.push(value.complexity >= 2 ? 'moderate_complexity' : 'moderate_risk');
  } else reasons.push('routine_task');
  if (value.budget === 'tight' && tier === 'deep' && value.risk !== 'critical') {
    tier = 'balanced';
    reasons.push('budget_cap');
  }
  return { schema: 'jarvis-public-model-route/v1', mode: 'recommendation_only', tier, reasons, allowedTiers: TIERS };
}

export function routeTask(input = {}) {
  const value = normalized(input);
  const legacy = recommendRoute(value);
  const maxConditions = Object.fromEntries(MAX_CONDITIONS.map(([name, predicate]) => [name, predicate(value)]));
  const mechanical = ['mechanical', 'formatting', 'copy'].includes(value.taskType);
  const maxEligible = value.maxRequested === true && !mechanical && Object.values(maxConditions).every(Boolean);
  const effort = maxEligible ? 'max' : legacy.tier === 'fast' ? 'low' : legacy.tier === 'balanced' ? 'medium' : 'high';
  return {
    schema: 'jarvis-public-model-governor/v1',
    mode: 'recommendation_only',
    profile: legacy.tier,
    reasoningEffort: effort,
    reasons: legacy.reasons,
    maxConditions,
    maxEligible,
    requestedEffortIgnored: value.requestedEffort === 'ultra' ? 'ultra_is_never_automatically_recommended' : '',
    applyAutomatically: false,
    stopConditionRequired: effort === 'max',
  };
}

export function explainRoute(route) {
  return {
    profile: route.profile,
    reasoningEffort: route.reasoningEffort,
    matchedReasons: route.reasons || [],
    unmetMaxConditions: Object.entries(route.maxConditions || {}).filter(([, passed]) => !passed).map(([name]) => name),
    automaticChange: false,
  };
}

export function defaultRoutingFixtures() {
  const taskTypes = ['mechanical', 'general', 'analysis', 'release', 'security'];
  return Array.from({ length: 30 }, (_, index) => ({
    name: `public-routing-${String(index + 1).padStart(2, '0')}`,
    input: {
      taskType: taskTypes[index % taskTypes.length],
      complexity: (index % 5) + 1,
      risk: ['low', 'medium', 'high'][index % 3],
      budget: index % 4 === 0 ? 'tight' : 'normal',
    },
  }));
}

export function evaluateRoutingFixtures(fixtures = defaultRoutingFixtures()) {
  const routes = fixtures.map((fixture) => ({ name: fixture.name, route: routeTask(fixture.input) }));
  const violations = routes.filter(({ route }, index) =>
    route.reasoningEffort === 'ultra'
    || (['mechanical', 'formatting', 'copy'].includes(fixtures[index].input.taskType) && route.reasoningEffort === 'max')
    || route.applyAutomatically !== false);
  return { schema: 'jarvis-public-model-evaluation/v1', total: routes.length, violations, routes, simulated: true, promotionEligible: false };
}

export async function writeShadowObservation(path, observation = {}) {
  const record = {
    schema: 'jarvis-public-model-shadow/v1',
    observedAt: new Date().toISOString(),
    taskId: String(observation.taskId || ''),
    projectId: String(observation.projectId || ''),
    route: observation.route || routeTask(observation),
    localOnly: true,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  return record;
}

export async function auditTokenTelemetry(paths = []) {
  const totals = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  let observations = 0;
  for (const path of paths) {
    let stream;
    try { stream = createReadStream(path, { encoding: 'utf8' }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    stream.on('error', () => {});
    try {
      for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (!event.usage || typeof event.usage !== 'object') continue;
      totals.inputTokens += Number(event.usage.inputTokens || 0);
      totals.outputTokens += Number(event.usage.outputTokens || 0);
      totals.cachedTokens += Number(event.usage.cachedTokens || 0);
      observations += 1;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { schema: 'jarvis-public-token-telemetry/v1', label: 'local usage telemetry, not billing', observations, totals };
}

export const modelGovernorInternals = { MAX_CONDITIONS, TIERS };
