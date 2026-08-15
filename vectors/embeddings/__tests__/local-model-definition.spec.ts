/** Verifies the supported local embedding model registry. */

import { describe, expect, it } from 'vitest';

import { LOCAL_EMBEDDING_MODELS } from '../local-model-definition';

describe('local embedding model registry', () => {
  it('defines the nine requested models in tier order with unique canonical IDs', () => {
    expect(LOCAL_EMBEDDING_MODELS).toHaveLength(9);
    expect(new Set(LOCAL_EMBEDDING_MODELS.map((model) => model.modelName)).size).toBe(9);
    expect(LOCAL_EMBEDDING_MODELS.map((model) => model.tier)).toEqual([
      'large',
      'large',
      'large',
      'medium',
      'medium',
      'medium',
      'small',
      'small',
      'small',
    ]);
    expect(
      LOCAL_EMBEDDING_MODELS.map((model) => ({
        modelName: model.modelName,
        providerName: model.providerName,
        dimensions: model.dimensions,
        language: model.language,
      })),
    ).toEqual([
      {
        modelName: 'mixedbread-ai/mxbai-embed-large-v1',
        providerName: 'Mixedbread',
        dimensions: 1024,
        language: 'English',
      },
      {
        modelName: 'BAAI/bge-large-en-v1.5',
        providerName: 'BAAI',
        dimensions: 1024,
        language: 'English',
      },
      {
        modelName: 'BAAI/bge-m3',
        providerName: 'BAAI',
        dimensions: 1024,
        language: 'Multilingual (100+ languages)',
      },
      {
        modelName: 'nomic-ai/nomic-embed-text-v1.5',
        providerName: 'Nomic',
        dimensions: 768,
        language: 'English',
      },
      {
        modelName: 'BAAI/bge-base-en-v1.5',
        providerName: 'BAAI',
        dimensions: 768,
        language: 'English',
      },
      {
        modelName: 'Alibaba-NLP/gte-multilingual-base',
        providerName: 'Alibaba',
        dimensions: 768,
        language: 'Multilingual (75 languages)',
      },
      {
        modelName: 'BAAI/bge-small-en-v1.5',
        providerName: 'BAAI',
        dimensions: 384,
        language: 'English',
      },
      {
        modelName: 'sentence-transformers/all-MiniLM-L6-v2',
        providerName: 'Sentence Transformers',
        dimensions: 384,
        language: 'English',
      },
      {
        modelName: 'Snowflake/snowflake-arctic-embed-xs',
        providerName: 'Snowflake',
        dimensions: 384,
        language: 'English',
      },
    ]);
  });

  it('keeps canonical vector identity separate from fixed ONNX download sources', () => {
    const bgeM3 = LOCAL_EMBEDDING_MODELS.find((model) => model.modelName === 'BAAI/bge-m3')!;
    const miniLm = LOCAL_EMBEDDING_MODELS.find(
      (model) => model.modelName === 'sentence-transformers/all-MiniLM-L6-v2',
    )!;

    expect(bgeM3).toMatchObject({
      providerName: 'BAAI',
      dimensions: 1024,
      language: 'Multilingual (100+ languages)',
      sourceModelName: 'onnx-community/bge-m3-ONNX',
      space: { model: 'BAAI/bge-m3', dimensions: 1024 },
    });
    expect(miniLm).toMatchObject({
      sourceModelName: 'Xenova/all-MiniLM-L6-v2',
      space: { model: 'sentence-transformers/all-MiniLM-L6-v2', dimensions: 384 },
    });
  });
});
