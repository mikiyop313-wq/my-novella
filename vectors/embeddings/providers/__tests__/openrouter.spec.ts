import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OpenRouterEmbeddingModelName } from '../../../../shared/models/vector.model';
import {
  OPENROUTER_EMBEDDING_MODEL_DEFINITIONS,
  getOpenRouterEmbeddingModelDefinition,
} from '../../openrouter-model-definition';
import { OpenRouterEmbeddingProvider } from '../openrouter';

describe('OpenRouterEmbeddingProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('defines exactly the ten curated native embedding spaces', () => {
    expect(OPENROUTER_EMBEDDING_MODEL_DEFINITIONS.map((model) => [
      model.modelName,
      model.dimensions,
    ])).toEqual([
      ['voyageai/voyage-multimodal-3.5', 1024],
      ['voyageai/voyage-4-lite', 1024],
      ['voyageai/voyage-4', 1024],
      ['voyageai/voyage-4-large', 1024],
      ['google/gemini-embedding-2', 3072],
      ['openai/text-embedding-3-large', 3072],
      ['openai/text-embedding-3-small', 1536],
      ['nvidia/nemotron-3-embed-1b:free', 2048],
      ['qwen/qwen3-embedding-8b', 4096],
      ['qwen/qwen3-embedding-4b', 2560],
    ]);
  });

  it('defines every formatting strategy without a default model', () => {
    expect(OPENROUTER_EMBEDDING_MODEL_DEFINITIONS.map((model) => [
      model.modelName,
      model.inputStrategy,
      'default' in model,
    ])).toEqual([
      ['voyageai/voyage-multimodal-3.5', { type: 'inputType', query: 'query', document: 'document' }, false],
      ['voyageai/voyage-4-lite', { type: 'inputType', query: 'query', document: 'document' }, false],
      ['voyageai/voyage-4', { type: 'inputType', query: 'query', document: 'document' }, false],
      ['voyageai/voyage-4-large', { type: 'inputType', query: 'query', document: 'document' }, false],
      ['google/gemini-embedding-2', {
        type: 'prefix',
        query: 'task: search result | query: ',
        document: 'title: none | text: ',
      }, false],
      ['openai/text-embedding-3-large', { type: 'none' }, false],
      ['openai/text-embedding-3-small', { type: 'none' }, false],
      ['nvidia/nemotron-3-embed-1b:free', {
        type: 'inputType',
        query: 'query',
        document: 'passage',
      }, false],
      ['qwen/qwen3-embedding-8b', {
        type: 'prefix',
        query: 'Instruct: Given a search query, retrieve relevant passages from a novel manuscript\nQuery:',
        document: '',
      }, false],
      ['qwen/qwen3-embedding-4b', {
        type: 'prefix',
        query: 'Instruct: Given a search query, retrieve relevant passages from a novel manuscript\nQuery:',
        document: '',
      }, false],
    ]);
  });

  it.each([
    ['voyageai/voyage-4', 'query', 'query text'],
    ['nvidia/nemotron-3-embed-1b:free', 'query', 'query text'],
    ['openai/text-embedding-3-small', undefined, 'query text'],
    [
      'google/gemini-embedding-2',
      undefined,
      'task: search result | query: query text',
    ],
    [
      'qwen/qwen3-embedding-4b',
      undefined,
      'Instruct: Given a search query, retrieve relevant passages from a novel manuscript\nQuery:query text',
    ],
  ] as const)(
    'formats query input for %s',
    async (modelName, expectedInputType, expectedText) => {
      const provider = createProvider(modelName);
      fetchMock.mockResolvedValue(okResponse(provider.space.dimensions, 1));

      await provider.embedQuery('query text');

      const payload = requestBody(0);
      expect(payload['input']).toEqual([expectedText]);
      expect(payload['input_type']).toBe(expectedInputType);
      expect(payload).not.toHaveProperty('dimensions');
      expect(payload['provider']).toEqual({
        allow_fallbacks: false,
        data_collection: 'deny',
      });
    },
  );

  it.each([
    ['voyageai/voyage-multimodal-3.5', 'document', 'document text'],
    ['nvidia/nemotron-3-embed-1b:free', 'passage', 'document text'],
    ['openai/text-embedding-3-large', undefined, 'document text'],
    ['google/gemini-embedding-2', undefined, 'title: none | text: document text'],
    ['qwen/qwen3-embedding-8b', undefined, 'document text'],
  ] as const)(
    'formats document input for %s',
    async (modelName, expectedInputType, expectedText) => {
      const provider = createProvider(modelName);
      fetchMock.mockResolvedValue(okResponse(provider.space.dimensions, 1));

      await provider.embedDocuments(['document text']);

      const payload = requestBody(0);
      expect(payload['input']).toEqual([expectedText]);
      expect(payload['input_type']).toBe(expectedInputType);
    },
  );

  it('restores response index order and validates the returned dimensions', async () => {
    const provider = createProvider('voyageai/voyage-4-lite');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: new Array(1024).fill(2) },
        { index: 0, embedding: new Array(1024).fill(1) },
      ],
    }), { status: 200 }));

    const result = await provider.embedDocuments(['first', 'second']);

    expect(result[0][0]).toBe(1);
    expect(result[1][0]).toBe(2);
  });

  it('retries once with account privacy settings only for no allowed providers', async () => {
    const provider = createProvider('openai/text-embedding-3-small');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'No allowed providers are available for the selected model' },
      }), { status: 404 }))
      .mockResolvedValueOnce(okResponse(1536, 1));

    await provider.embedQuery('query');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(0)['provider']).toEqual({
      allow_fallbacks: false,
      data_collection: 'deny',
    });
    expect(requestBody(1)['provider']).toEqual({ allow_fallbacks: false });
    expect(requestBody(1)['model']).toBe('openai/text-embedding-3-small');
  });

  it('does not retry unrelated errors or accept malformed vector counts', async () => {
    const provider = createProvider('openai/text-embedding-3-small');
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(provider.embedQuery('query')).rejects.toThrow('API error (429)');
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
      status: 200,
    }));
    await expect(provider.embedQuery('query')).rejects.toThrow(
      'returned 0 embeddings for 1 inputs',
    );
  });

  it('rejects malformed responses, invalid indexes, and non-native dimensions', async () => {
    const provider = createProvider('openai/text-embedding-3-small');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: 'invalid' }), {
      status: 200,
    }));
    await expect(provider.embedQuery('query')).rejects.toThrow('malformed embeddings response');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      data: [
        { index: 0, embedding: new Array(1536).fill(1) },
        { index: 0, embedding: new Array(1536).fill(2) },
      ],
    }), { status: 200 }));
    await expect(provider.embedDocuments(['first', 'second'])).rejects.toThrow(
      'invalid embedding indexes',
    );

    fetchMock.mockResolvedValueOnce(okResponse(1535, 1));
    await expect(provider.embedQuery('query')).rejects.toThrow('expected 1536, received 1535');
  });

  function requestBody(callIndex: number): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[callIndex][1].body as string) as Record<string, unknown>;
  }
});

function createProvider(modelName: OpenRouterEmbeddingModelName): OpenRouterEmbeddingProvider {
  const definition = getOpenRouterEmbeddingModelDefinition(modelName);
  return new OpenRouterEmbeddingProvider({
    type: 'openrouter',
    modelName,
    dimensions: definition.dimensions,
    apiKey: 'openrouter-secret',
    definition,
  });
}

function okResponse(dimensions: number, count: number): Response {
  return new Response(JSON.stringify({
    data: Array.from({ length: count }, (_, index) => ({
      index,
      embedding: new Array(dimensions).fill(index + 1),
    })),
  }), { status: 200 });
}
