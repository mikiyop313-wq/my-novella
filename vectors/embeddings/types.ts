export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export type EmbeddingProviderType = 'local' | 'openai' | 'voyage';

export interface BaseEmbeddingConfig {
  type: EmbeddingProviderType;
  modelName: string;
  dimensions?: number;
  inputType?: 'document' | 'query';
}

export interface CloudEmbeddingConfig extends BaseEmbeddingConfig {
  apiKey: string;
}

export interface LocalEmbeddingConfig extends BaseEmbeddingConfig {
  type: 'local';
  dimensions: number; // Required for local
  modelPath?: string; // Path to a pre-downloaded local model
  cacheDir?: string;  // Directory for caching models downloaded from HuggingFace
}

export interface OpenAIEmbeddingConfig extends CloudEmbeddingConfig {
  type: 'openai';
  organization?: string;
  baseUrl?: string;
}

export interface VoyageEmbeddingConfig extends CloudEmbeddingConfig {
  type: 'voyage';
}

export type EmbeddingConfig = LocalEmbeddingConfig | OpenAIEmbeddingConfig | VoyageEmbeddingConfig;
