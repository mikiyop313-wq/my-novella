import type { OpenRouterEmbeddingConfig } from '../types';
import { assertEmbeddingDimensions, type EmbeddingProvider } from '../types';
import type { OpenRouterEmbeddingModelDefinition } from '../openrouter-model-definition';

const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const NO_ALLOWED_PROVIDERS_MESSAGE = 'no allowed providers are available';

interface OpenRouterEmbeddingProviderConfig extends OpenRouterEmbeddingConfig {
  definition: OpenRouterEmbeddingModelDefinition;
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly space;

  constructor(private readonly config: OpenRouterEmbeddingProviderConfig) {
    this.space = {
      provider: 'openRouter' as const,
      model: config.modelName,
      dimensions: config.dimensions,
      revision: config.definition.revision,
    };
  }

  async embedQuery(text: string): Promise<number[]> {
    return (await this.embedTexts([text], 'query'))[0];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.embedTexts(texts, 'document');
  }

  private async embedTexts(
    texts: string[],
    inputKind: 'query' | 'document',
  ): Promise<number[][]> {
    const { input, inputType } = this.formatInput(texts, inputKind);
    const basePayload: Record<string, unknown> = {
      model: this.config.modelName,
      input,
      encoding_format: 'float',
    };
    if (inputType) basePayload['input_type'] = inputType;

    let response = await this.send(basePayload, true);
    let errorText: string | null = null;

    if (!response.ok) {
      errorText = await response.text();
      if (this.isNoPrivacyCompatibleProvider(response.status, errorText)) {
        console.warn(
          `[OpenRouterEmbeddings] No data-collection-denied endpoint is available for ${this.config.modelName}; retrying with the account privacy policy.`,
        );
        response = await this.send(basePayload, false);
        errorText = response.ok ? null : await response.text();
      }
    }

    if (!response.ok) {
      throw new Error(
        `OpenRouter embeddings API error (${response.status}): ${errorText ?? response.statusText}`,
      );
    }

    const vectors = this.parseResponse(await response.json(), texts.length);
    assertEmbeddingDimensions(this, vectors);
    return vectors;
  }

  private send(payload: Record<string, unknown>, denyDataCollection: boolean): Promise<Response> {
    return fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        provider: {
          allow_fallbacks: false,
          ...(denyDataCollection ? { data_collection: 'deny' } : {}),
        },
      }),
    });
  }

  private formatInput(
    texts: string[],
    inputKind: 'query' | 'document',
  ): { input: string[]; inputType?: string } {
    const strategy = this.config.definition.inputStrategy;
    switch (strategy.type) {
      case 'none':
        return { input: texts };
      case 'inputType':
        return { input: texts, inputType: strategy[inputKind] };
      case 'prefix':
        return { input: texts.map((text) => `${strategy[inputKind]}${text}`) };
    }
  }

  private parseResponse(value: unknown, expectedCount: number): number[][] {
    if (!isObject(value) || !Array.isArray(value['data'])) {
      throw new Error('OpenRouter returned a malformed embeddings response.');
    }
    if (value['data'].length !== expectedCount) {
      throw new Error(
        `OpenRouter returned ${value['data'].length} embeddings for ${expectedCount} inputs.`,
      );
    }

    const indexed = value['data'].map((rawItem) => {
      if (!isObject(rawItem) || !Number.isInteger(rawItem['index'])) {
        throw new Error('OpenRouter returned a malformed embeddings response.');
      }
      const embedding = rawItem['embedding'];
      if (!Array.isArray(embedding) || !embedding.every((item) => typeof item === 'number')) {
        throw new Error('OpenRouter returned a malformed embeddings response.');
      }
      return { index: rawItem['index'] as number, embedding: embedding as number[] };
    });

    indexed.sort((left, right) => left.index - right.index);
    if (indexed.some((item, index) => item.index !== index)) {
      throw new Error('OpenRouter returned invalid embedding indexes.');
    }
    return indexed.map((item) => item.embedding);
  }

  private isNoPrivacyCompatibleProvider(status: number, body: string): boolean {
    return status === 404 && body.toLowerCase().includes(NO_ALLOWED_PROVIDERS_MESSAGE);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
