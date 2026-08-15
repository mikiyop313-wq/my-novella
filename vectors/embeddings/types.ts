/**
 * Defines embedding-provider contracts, configurations, and shared validation helpers.
 *
 * @packageDocumentation
 */

import type { EmbeddingSpaceDescriptor } from '../../shared/models/vector.model';
import type { LocalEmbeddingModelDownloadProgress } from '../../shared/models/vector.model';

/** Produces query and document vectors within one compatible embedding space. */
export interface EmbeddingProvider {
  readonly space: EmbeddingSpaceDescriptor;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

/**
 * Ensures every generated vector matches the provider's declared dimensions.
 *
 * @param provider - Provider that generated the vectors.
 * @param vectors - Vectors to validate.
 * @throws Error when any vector has an incompatible length.
 */
export function assertEmbeddingDimensions(
  provider: EmbeddingProvider,
  vectors: readonly number[][],
): void {
  const invalid = vectors.find(vector => vector.length !== provider.space.dimensions);
  if (invalid) {
    throw new Error(
      `Embedding dimension mismatch for ${provider.space.model}: `
      + `expected ${provider.space.dimensions}, received ${invalid.length}.`,
    );
  }
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

/** Configuration needed to load and manage an on-device embedding model. */
export interface LocalEmbeddingConfig extends BaseEmbeddingConfig {
  type: 'local';
  dimensions: number; // Required for local
  modelPath?: string; // Path to a pre-downloaded local model
  cacheDir?: string;  // Directory for caching models downloaded from HuggingFace
  installationMarkerPath: string;
}

/** Receives normalized per-file progress from a local-model download. */
export type LocalEmbeddingDownloadProgressCallback = (
  progress: LocalEmbeddingModelDownloadProgress,
) => void;

export interface OpenAIEmbeddingConfig extends CloudEmbeddingConfig {
  type: 'openai';
  organization?: string;
  baseUrl?: string;
}

export interface VoyageEmbeddingConfig extends CloudEmbeddingConfig {
  type: 'voyage';
}

export type EmbeddingConfig = LocalEmbeddingConfig | OpenAIEmbeddingConfig | VoyageEmbeddingConfig;
