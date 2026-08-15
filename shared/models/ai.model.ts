/** Model metadata returned by the AI model-list IPC channel. */
export interface AiModel {
  id: string;
  name?: string;
  provider?: string;
  providerName?: string;
  source?: 'direct' | 'openrouter' | 'local';
  supportsReasoning?: boolean;
}

export const AI_CLOUD_PROVIDER_IDS = [
  'openrouter',
  'google',
  'openai',
  'anthropic',
] as const;

export const AI_LOCAL_PROVIDER_IDS = ['ollama', 'lm-studio'] as const;

export type AiCloudProviderId = (typeof AI_CLOUD_PROVIDER_IDS)[number];
export type AiLocalProviderId = (typeof AI_LOCAL_PROVIDER_IDS)[number];
export type AiProviderId = AiCloudProviderId | AiLocalProviderId;

export interface AiApiKeyStatus {
  configured: boolean;
  suffix: string | null;
}

export interface AiProviderConfiguration {
  apiKeys: Record<AiCloudProviderId, AiApiKeyStatus>;
  serverUrls: Record<AiLocalProviderId, string | null>;
}

export interface SaveAiApiKeyRequest {
  providerId: AiCloudProviderId;
  apiKey: string;
}

export interface LoadAiApiKeyRequest {
  providerId: AiCloudProviderId;
}

export interface SaveAiServerUrlRequest {
  providerId: AiLocalProviderId;
  serverUrl: string;
}

export interface TestAiProviderConnectionRequest {
  providerId: AiProviderId;
}
