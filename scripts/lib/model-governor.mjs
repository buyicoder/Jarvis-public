const TIERS = ['fast', 'balanced', 'deep'];

export function recommendRoute(input = {}) {
  const complexity = Number(input.complexity || 1);
  const risk = String(input.risk || 'low').toLowerCase();
  const budget = String(input.budget || 'normal').toLowerCase();
  if (!Number.isInteger(complexity) || complexity < 1 || complexity > 5) throw new Error('complexity must be an integer from 1 to 5.');
  if (!['low', 'medium', 'high', 'critical'].includes(risk)) throw new Error('risk must be low, medium, high, or critical.');
  if (!['tight', 'normal', 'flexible'].includes(budget)) throw new Error('budget must be tight, normal, or flexible.');
  let tier = 'fast';
  const reasons = [];
  if (complexity >= 4 || ['high', 'critical'].includes(risk)) {
    tier = 'deep';
    if (complexity >= 4) reasons.push('high_complexity');
    if (['high', 'critical'].includes(risk)) reasons.push(risk === 'critical' ? 'critical_risk' : 'high_risk');
  } else if (complexity >= 2 || risk === 'medium') {
    tier = 'balanced';
    reasons.push(complexity >= 2 ? 'moderate_complexity' : 'moderate_risk');
  } else reasons.push('routine_task');
  if (budget === 'tight' && tier === 'deep' && risk !== 'critical') {
    tier = 'balanced';
    reasons.push('budget_cap');
  }
  return { schema: 'jarvis-public-model-route/v1', mode: 'recommendation_only', tier, reasons, allowedTiers: TIERS };
}
