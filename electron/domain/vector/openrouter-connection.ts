import { vectorApiKeyService, type VectorApiKeyService } from './vector-api-key.service';

const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const CONNECTION_TIMEOUT_MS = 10_000;

/** Validates the saved OpenRouter key without selecting an embedding model. */
export async function testOpenRouterConnection(
  keys: VectorApiKeyService = vectorApiKeyService,
): Promise<void> {
  const apiKey = await keys.getApiKey('openrouter');
  if (!apiKey) {
    throw new Error('OpenRouter vector connection test requires an API key.');
  }

  const response = await fetch(OPENROUTER_KEY_URL, {
    signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const body: unknown = await response.json();
  if (!isObject(body) || !isObject(body['data'])) {
    throw new Error('OpenRouter returned a malformed connection response.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
