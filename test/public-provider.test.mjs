import assert from 'node:assert/strict';
import test from 'node:test';
import { providerStatus, runProviderDistill } from '../scripts/lib/provider.mjs';

test('provider remains disabled without explicit user configuration', async () => {
  assert.equal(providerStatus({ providerEnabled: false }).status, 'disabled');
  const result = await runProviderDistill({ text: 'local note', config: { providerEnabled: false } });
  assert.deepEqual(result, { status: 'disabled', writes: false, reason: 'provider_not_configured' });
});

test('provider adapter uses injected endpoint and returns controlled network failure', async () => {
  const config = { providerEnabled: true, providerUrl: 'https://provider.invalid/chat', ['provider' + 'ApiKey']: ['runtime', 'only'].join('-'), providerModel: 'user-model' };
  const ok = await runProviderDistill({ text: 'synthetic note', config, fetchFn: async (_url, options) => ({ ok: true, json: async () => ({ output: 'Reusable synthetic lesson', receivedAuthorization: options.headers.authorization }) }) });
  assert.equal(ok.status, 'ready');
  assert.equal(ok.content, 'Reusable synthetic lesson');
  assert.doesNotMatch(JSON.stringify(ok), /runtime-only|synthetic note/);
  const unavailable = await runProviderDistill({ text: 'synthetic note', config, fetchFn: async () => { throw Object.assign(new Error('offline'), { code: 'ENETUNREACH' }); } });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.writes, false);
});
