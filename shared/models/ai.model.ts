/** Model metadata returned by the AI model-list IPC channel. */
export interface AiModel {
  id: string;
  name?: string;
  provider?: string;
  providerName?: string;
  source?: 'direct' | 'openrouter';
  supportsReasoning?: boolean;
}
