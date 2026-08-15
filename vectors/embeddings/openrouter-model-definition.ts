import type {
  OpenRouterEmbeddingModelDescriptor,
  OpenRouterEmbeddingModelName,
} from '../../shared/models/vector.model';

export type OpenRouterInputStrategy =
  | { type: 'none' }
  | { type: 'inputType'; query: string; document: string }
  | { type: 'prefix'; query: string; document: string };

export interface OpenRouterEmbeddingModelDefinition
  extends OpenRouterEmbeddingModelDescriptor {
  revision: string;
  inputStrategy: OpenRouterInputStrategy;
}

const QWEN_QUERY_PREFIX =
  'Instruct: Given a search query, retrieve relevant passages from a novel manuscript\nQuery:';

export const OPENROUTER_EMBEDDING_MODEL_DEFINITIONS:
readonly OpenRouterEmbeddingModelDefinition[] = [
  {
    modelName: 'voyageai/voyage-multimodal-3.5',
    displayName: 'voyage-multimodal-3.5',
    providerName: 'VoyageAI by MongoDB',
    dimensions: 1024,
    revision: '1',
    inputStrategy: { type: 'inputType', query: 'query', document: 'document' },
  },
  {
    modelName: 'voyageai/voyage-4-lite',
    displayName: 'voyage-4-lite',
    providerName: 'VoyageAI by MongoDB',
    dimensions: 1024,
    revision: '1',
    inputStrategy: { type: 'inputType', query: 'query', document: 'document' },
  },
  {
    modelName: 'voyageai/voyage-4',
    displayName: 'voyage-4',
    providerName: 'VoyageAI by MongoDB',
    dimensions: 1024,
    revision: '1',
    inputStrategy: { type: 'inputType', query: 'query', document: 'document' },
  },
  {
    modelName: 'voyageai/voyage-4-large',
    displayName: 'voyage-4-large',
    providerName: 'VoyageAI by MongoDB',
    dimensions: 1024,
    revision: '1',
    inputStrategy: { type: 'inputType', query: 'query', document: 'document' },
  },
  {
    modelName: 'google/gemini-embedding-2',
    displayName: 'Gemini Embedding 2',
    providerName: 'Google',
    dimensions: 3072,
    revision: '1',
    inputStrategy: {
      type: 'prefix',
      query: 'task: search result | query: ',
      document: 'title: none | text: ',
    },
  },
  {
    modelName: 'openai/text-embedding-3-large',
    displayName: 'Text Embedding 3 Large',
    providerName: 'OpenAI',
    dimensions: 3072,
    revision: '1',
    inputStrategy: { type: 'none' },
  },
  {
    modelName: 'openai/text-embedding-3-small',
    displayName: 'Text Embedding 3 Small',
    providerName: 'OpenAI',
    dimensions: 1536,
    revision: '1',
    inputStrategy: { type: 'none' },
  },
  {
    modelName: 'nvidia/nemotron-3-embed-1b:free',
    displayName: 'Nemotron 3 Embed 1B (free)',
    providerName: 'NVIDIA',
    dimensions: 2048,
    revision: '1',
    inputStrategy: { type: 'inputType', query: 'query', document: 'passage' },
  },
  {
    modelName: 'qwen/qwen3-embedding-8b',
    displayName: 'Qwen3 Embedding 8B',
    providerName: 'Qwen',
    dimensions: 4096,
    revision: '1',
    inputStrategy: { type: 'prefix', query: QWEN_QUERY_PREFIX, document: '' },
  },
  {
    modelName: 'qwen/qwen3-embedding-4b',
    displayName: 'Qwen3 Embedding 4B',
    providerName: 'Qwen',
    dimensions: 2560,
    revision: '1',
    inputStrategy: { type: 'prefix', query: QWEN_QUERY_PREFIX, document: '' },
  },
] as const;

/** Public catalog returned to renderer clients without internal formatting rules. */
export const OPENROUTER_EMBEDDING_MODELS: readonly OpenRouterEmbeddingModelDescriptor[] =
  OPENROUTER_EMBEDDING_MODEL_DEFINITIONS.map((model) => ({
    modelName: model.modelName,
    displayName: model.displayName,
    providerName: model.providerName,
    dimensions: model.dimensions,
  }));

export function isOpenRouterEmbeddingModelName(
  modelName: string,
): modelName is OpenRouterEmbeddingModelName {
  return OPENROUTER_EMBEDDING_MODEL_DEFINITIONS.some(
    (model) => model.modelName === modelName,
  );
}

export function getOpenRouterEmbeddingModelDefinition(
  modelName: OpenRouterEmbeddingModelName | string,
): OpenRouterEmbeddingModelDefinition {
  const model = OPENROUTER_EMBEDDING_MODEL_DEFINITIONS.find(
    (candidate) => candidate.modelName === modelName,
  );
  if (!model) throw new Error(`Unsupported OpenRouter embedding model: ${modelName}`);
  return model;
}
