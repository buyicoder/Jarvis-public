export function providerStatus(config = {}) {
  if (config.providerEnabled !== true) return { status: 'disabled', reason: 'provider_not_enabled' };
  if (!config.providerUrl || !config.providerApiKey || !config.providerModel) return { status: 'disabled', reason: 'provider_not_configured' };
  return { status: 'ready', endpointConfigured: true, modelConfigured: true };
}

export async function runProviderDistill({ text, config = {}, fetchFn = fetch }) {
  const status = providerStatus(config);
  if (status.status !== 'ready') return { status: 'disabled', writes: false, reason: 'provider_not_configured' };
  try {
    const response = await fetchFn(config.providerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.providerApiKey}` },
      body: JSON.stringify({ model: config.providerModel, input: String(text || ''), mode: 'distill_without_writes' }),
    });
    if (!response.ok) return { status: 'unavailable', writes: false, reason: `provider_http_${response.status}` };
    const data = await response.json();
    return { status: 'ready', writes: false, content: String(data.output || data.content || '').trim(), provider: 'user_configured' };
  } catch (error) {
    return { status: 'unavailable', writes: false, reason: error.code || 'provider_network_error' };
  }
}
