/**
 * Centralizes the supported local embedding model's identity, vector space, and cache paths.
 *
 * @packageDocumentation
 */

import { app } from 'electron';
import * as path from 'path';

import type {
  EmbeddingSpaceDescriptor,
  LocalEmbeddingModelDescriptor,
  LocalEmbeddingModelName,
} from '../../shared/models/vector.model';

/** Hugging Face repository identifier for the supported local model. */
export const LOCAL_EMBEDDING_MODEL_NAME = 'mixedbread-ai/mxbai-embed-large-v1';
/** Number of values produced by the supported local model. */
export const LOCAL_EMBEDDING_MODEL_DIMENSIONS = 1024;
/** Application-level revision used to isolate compatible local vectors. */
export const LOCAL_EMBEDDING_MODEL_REVISION = '1';

/** Internal runtime details attached to one public catalog entry. */
export interface LocalEmbeddingModelDefinition extends LocalEmbeddingModelDescriptor {
  sourceModelName: string;
  quantized: boolean;
  revision: string;
  space: EmbeddingSpaceDescriptor;
}

type ModelDefinitionInput = LocalEmbeddingModelDescriptor & {
  sourceModelName: string;
  quantized?: boolean;
};

/** Builds a complete immutable registry entry from its catalog metadata. */
function defineModel(input: ModelDefinitionInput): LocalEmbeddingModelDefinition {
  const revision = LOCAL_EMBEDDING_MODEL_REVISION;
  return {
    ...input,
    quantized: input.quantized ?? true,
    revision,
    space: {
      provider: 'local',
      model: input.modelName,
      dimensions: input.dimensions,
      revision,
    },
  };
}

/** Supported local models in the order shown by the settings screen. */
export const LOCAL_EMBEDDING_MODELS: readonly LocalEmbeddingModelDefinition[] = [
  defineModel({
    modelName: LOCAL_EMBEDDING_MODEL_NAME,
    displayName: 'Mixedbread mxbai Embed Large v1',
    providerName: 'Mixedbread',
    providerInitials: 'MB',
    tier: 'large',
    dimensions: 1024,
    language: 'English',
    sourceModelName: LOCAL_EMBEDDING_MODEL_NAME,
  }),
  defineModel({
    modelName: 'BAAI/bge-large-en-v1.5',
    displayName: 'BGE Large English v1.5',
    providerName: 'BAAI',
    providerInitials: 'BA',
    tier: 'large',
    dimensions: 1024,
    language: 'English',
    sourceModelName: 'Xenova/bge-large-en-v1.5',
  }),
  defineModel({
    modelName: 'BAAI/bge-m3',
    displayName: 'BGE-M3',
    providerName: 'BAAI',
    providerInitials: 'BA',
    tier: 'large',
    dimensions: 1024,
    language: 'Multilingual (100+ languages)',
    sourceModelName: 'onnx-community/bge-m3-ONNX',
  }),
  defineModel({
    modelName: 'nomic-ai/nomic-embed-text-v1.5',
    displayName: 'Nomic Embed Text v1.5',
    providerName: 'Nomic',
    providerInitials: 'NO',
    tier: 'medium',
    dimensions: 768,
    language: 'English',
    sourceModelName: 'nomic-ai/nomic-embed-text-v1.5',
  }),
  defineModel({
    modelName: 'BAAI/bge-base-en-v1.5',
    displayName: 'BGE Base English v1.5',
    providerName: 'BAAI',
    providerInitials: 'BA',
    tier: 'medium',
    dimensions: 768,
    language: 'English',
    sourceModelName: 'Xenova/bge-base-en-v1.5',
  }),
  defineModel({
    modelName: 'Alibaba-NLP/gte-multilingual-base',
    displayName: 'GTE Multilingual Base',
    providerName: 'Alibaba',
    providerInitials: 'AL',
    tier: 'medium',
    dimensions: 768,
    language: 'Multilingual (75 languages)',
    sourceModelName: 'onnx-community/gte-multilingual-base',
  }),
  defineModel({
    modelName: 'BAAI/bge-small-en-v1.5',
    displayName: 'BGE Small English v1.5',
    providerName: 'BAAI',
    providerInitials: 'BA',
    tier: 'small',
    dimensions: 384,
    language: 'English',
    sourceModelName: 'Xenova/bge-small-en-v1.5',
  }),
  defineModel({
    modelName: 'sentence-transformers/all-MiniLM-L6-v2',
    displayName: 'All-MiniLM-L6-v2',
    providerName: 'Sentence Transformers',
    providerInitials: 'ST',
    tier: 'small',
    dimensions: 384,
    language: 'English',
    sourceModelName: 'Xenova/all-MiniLM-L6-v2',
  }),
  defineModel({
    modelName: 'Snowflake/snowflake-arctic-embed-xs',
    displayName: 'Snowflake Arctic Embed XS',
    providerName: 'Snowflake',
    providerInitials: 'SF',
    tier: 'small',
    dimensions: 384,
    language: 'English',
    sourceModelName: 'Snowflake/snowflake-arctic-embed-xs',
  }),
];

/** Resolves one supported model or rejects an untrusted IPC identifier. */
export function getLocalEmbeddingModelDefinition(
  modelName: LocalEmbeddingModelName | string,
): LocalEmbeddingModelDefinition {
  const definition = LOCAL_EMBEDDING_MODELS.find((model) => model.modelName === modelName);
  if (!definition) throw new Error(`Unsupported local embedding model: ${modelName}`);
  return definition;
}

/** Complete descriptor used to address this model's LanceDB table. */
export const LOCAL_EMBEDDING_SPACE: EmbeddingSpaceDescriptor = {
  provider: 'local',
  model: LOCAL_EMBEDDING_MODEL_NAME,
  dimensions: LOCAL_EMBEDDING_MODEL_DIMENSIONS,
  revision: LOCAL_EMBEDDING_MODEL_REVISION,
};

/** Filesystem locations used by Transformers.js and the installation lifecycle. */
export interface LocalEmbeddingModelPaths {
  cacheDir: string;
  modelDir: string;
  installationMarkerPath: string;
}

/**
 * Resolves the managed model's paths inside Electron's writable user-data directory.
 *
 * @returns Cache root, model directory, and installation-marker path.
 */
export function getLocalEmbeddingModelPaths(
  modelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): LocalEmbeddingModelPaths {
  const definition = getLocalEmbeddingModelDefinition(modelName);
  const cacheDir = path.join(app.getPath('userData'), 'models');
  const modelDir = path.join(cacheDir, ...definition.sourceModelName.split('/'));
  return {
    cacheDir,
    modelDir,
    installationMarkerPath: path.join(modelDir, '.installed'),
  };
}
