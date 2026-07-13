const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function providerEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { return { ok: false, reason: 'provider_endpoint_invalid' }; }
  if (url.username || url.password) return { ok: false, reason: 'provider_endpoint_credentials_forbidden' };
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!secure) return { ok: false, reason: 'provider_endpoint_insecure' };
  return { ok: true, url };
}

export function providerStatus(config = {}) {
  const resolved = resolveProvider(config);
  return resolved.status === 'ready'
    ? { status: 'ready', endpointConfigured: true, modelConfigured: true }
    : { status: 'disabled', reason: resolved.reason };
}

function resolveProvider(config) {
  if (config.providerEnabled !== true) return { status: 'disabled', reason: 'provider_not_enabled' };
  if (!config.providerUrl || !config.providerApiKey || !config.providerModel) return { status: 'disabled', reason: 'provider_not_configured' };
  const endpoint = providerEndpoint(config.providerUrl);
  return endpoint.ok ? { status: 'ready', endpoint: endpoint.url } : { status: 'disabled', reason: endpoint.reason };
}

export async function runProviderDistill({ text, config = {}, fetchFn = fetch, timeoutMs = 10_000 }) {
  const resolved = resolveProvider(config);
  if (resolved.status !== 'ready') {
    const reason = resolved.reason === 'provider_not_enabled' ? 'provider_not_configured' : resolved.reason;
    return { status: 'disabled', writes: false, reason };
  }
  const endpoint = resolved.endpoint;
  try {
    const response = await fetchFn(endpoint.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.providerApiKey}` },
      body: JSON.stringify({ model: config.providerModel, input: String(text || ''), mode: 'distill_without_writes' }),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) return { status: 'unavailable', writes: false, reason: 'provider_redirect_rejected' };
    if (response.redirected === true) return { status: 'unavailable', writes: false, reason: 'provider_redirect_rejected' };
    if (response.url) {
      const finalEndpoint = providerEndpoint(response.url);
      if (!finalEndpoint.ok || finalEndpoint.url.origin !== endpoint.origin) return { status: 'unavailable', writes: false, reason: 'provider_redirect_rejected' };
    }
    if (!response.ok) return { status: 'unavailable', writes: false, reason: `provider_http_${response.status}` };
    const data = await response.json();
    return { status: 'ready', writes: false, content: String(data.output || data.content || '').trim(), provider: 'user_configured' };
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'provider_timeout' : (typeof error.code === 'string' ? error.code : 'provider_network_error');
    return { status: 'unavailable', writes: false, reason };
  }
}
