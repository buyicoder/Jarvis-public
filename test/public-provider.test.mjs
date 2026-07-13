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

test('provider rejects plaintext remote endpoints and URL credentials before fetch', async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; throw new Error('must not fetch'); };
  const common = { providerEnabled: true, ['provider' + 'ApiKey']: ['runtime', 'only'].join('-'), providerModel: 'user-model' };
  const plaintext = await runProviderDistill({ text: 'private', config: { ...common, providerUrl: 'http://provider.example/chat' }, fetchFn });
  assert.equal(plaintext.reason, 'provider_endpoint_insecure');
  const credentialed = await runProviderDistill({ text: 'private', config: { ...common, providerUrl: 'https://user:pass@provider.example/chat' }, fetchFn });
  assert.equal(credentialed.reason, 'provider_endpoint_credentials_forbidden');
  assert.equal(calls, 0);
});

test('provider allows loopback HTTP but rejects redirects and sets a timeout', async () => {
  const config = { providerEnabled: true, providerUrl: 'http://127.0.0.1:8080/chat', ['provider' + 'ApiKey']: ['runtime', 'only'].join('-'), providerModel: 'user-model' };
  let options;
  const redirected = await runProviderDistill({
    text: 'private',
    config,
    timeoutMs: 1234,
    fetchFn: async (_url, value) => { options = value; return { ok: false, status: 302, headers: new Map([['location', 'https://elsewhere.example']]) }; },
  });
  assert.equal(redirected.reason, 'provider_redirect_rejected');
  assert.equal(options.redirect, 'manual');
  assert.ok(options.signal instanceof AbortSignal);
  const timeout = await runProviderDistill({
    text: 'private',
    config,
    fetchFn: async (_url, value) => new Promise((resolve, reject) => value.signal.addEventListener('abort', () => reject(value.signal.reason), { once: true })),
    timeoutMs: 1,
  });
  assert.equal(timeout.reason, 'provider_timeout');
});
