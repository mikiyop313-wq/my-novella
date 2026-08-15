import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { BookDto } from '../../../shared/models/book.model';
import type {
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  ResolvedBookEmbeddingSelection,
  VectorConfigurationProviderId,
} from '../../../shared/models/vector.model';

vi.mock('../../../db/repositories/book.repository', () => ({
  bookRepository: {},
}));

vi.mock('../../../electron/domain/vector/vector-api-key.service', () => ({
  vectorApiKeyService: {},
}));

vi.mock('../../embeddings/local-model-manager', () => ({
  localEmbeddingModelManager: {},
}));

import {
  DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  EmbeddingSelectionResolverService,
} from '../embedding-selection-resolver.service';

describe('EmbeddingSelectionResolverService', () => {
  let storedBook: BookDto;
  let statuses: LocalEmbeddingModelStatus[];
  let configuredProviders: Set<VectorConfigurationProviderId>;
  let setEmbeddingSelection: Mock<(
    bookId: string,
    selection: ResolvedBookEmbeddingSelection,
  ) => Promise<void>>;
  let service: EmbeddingSelectionResolverService;

  beforeEach(() => {
    storedBook = book({
      embeddingModel: 'local',
      localEmbeddingModel: 'mixedbread-ai/mxbai-embed-large-v1',
      openRouterEmbeddingModel: null,
    });
    statuses = [
      localStatus('mixedbread-ai/mxbai-embed-large-v1', false),
      localStatus('BAAI/bge-m3', false),
      localStatus('BAAI/bge-small-en-v1.5', false),
    ];
    configuredProviders = new Set();
    setEmbeddingSelection = vi.fn(async (
      _bookId: string,
      selection: ResolvedBookEmbeddingSelection,
    ) => {
      storedBook = book(selection);
    });
    service = new EmbeddingSelectionResolverService({
      repository: {
        getById: vi.fn(async () => storedBook),
        setEmbeddingSelection: async (bookId, selection) => {
          await setEmbeddingSelection(bookId, selection);
        },
      },
      getLocalModelStatuses: vi.fn(async () => statuses),
      getApiKey: vi.fn(async providerId => (
        configuredProviders.has(providerId) ? 'configured-key' : null
      )),
    });
  });

  it('preserves an available existing selection', async () => {
    statuses[0] = localStatus('mixedbread-ai/mxbai-embed-large-v1', true);

    await expect(service.ensureBookSelection('book-1')).resolves.toEqual({
      embeddingModel: 'local',
      localEmbeddingModel: 'mixedbread-ai/mxbai-embed-large-v1',
      openRouterEmbeddingModel: null,
    });
    expect(setEmbeddingSelection).not.toHaveBeenCalled();
  });

  it('selects the first installed local model in catalog order', async () => {
    statuses[1] = localStatus('BAAI/bge-m3', true);
    statuses[2] = localStatus('BAAI/bge-small-en-v1.5', true);
    configuredProviders.add('openrouter');

    await expect(service.ensureBookSelection('book-1')).resolves.toEqual({
      embeddingModel: 'local',
      localEmbeddingModel: 'BAAI/bge-m3',
      openRouterEmbeddingModel: null,
    });
  });

  it('prefers the free OpenRouter model over other configured cloud providers', async () => {
    configuredProviders = new Set(['openrouter', 'openai', 'voyage']);

    await expect(service.resolveForNewBook()).resolves.toEqual({
      embeddingModel: 'openRouter',
      localEmbeddingModel: null,
      openRouterEmbeddingModel: DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    });
  });

  it('uses OpenAI before Voyage when OpenRouter is not configured', async () => {
    configuredProviders = new Set(['openai', 'voyage']);

    await expect(service.resolveForNewBook()).resolves.toEqual({
      embeddingModel: 'openAI',
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
  });

  it('uses Voyage when it is the only configured cloud provider', async () => {
    configuredProviders.add('voyage');

    await expect(service.resolveForNewBook()).resolves.toEqual({
      embeddingModel: 'voyage',
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
  });

  it('clears an unavailable selection when no model is available', async () => {
    await expect(service.ensureBookSelection('book-1')).resolves.toEqual({
      embeddingModel: null,
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
    expect(setEmbeddingSelection).toHaveBeenCalledWith('book-1', {
      embeddingModel: null,
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
  });

  it('creates and returns settings for a legacy book without a settings row', async () => {
    storedBook = { ...storedBook, settings: undefined };

    const resolvedBooks = await service.resolveBooks([storedBook]);

    expect(setEmbeddingSelection).toHaveBeenCalledWith('book-1', {
      embeddingModel: null,
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
    expect(resolvedBooks[0].settings).toMatchObject({
      embeddingModel: null,
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    });
  });
});

function book(selection: ResolvedBookEmbeddingSelection): BookDto {
  return {
    id: 'book-1',
    title: 'Book',
    author: 'Author',
    status: 'draft',
    synopsis: null,
    coverImage: null,
    wordCount: 0,
    language: 'english',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      language: 'english',
      proseTense: 'past',
      pointOfView: 'third_limited',
      synopsisAiContext: false,
      ...selection,
    },
  };
}

function localStatus(
  modelName: LocalEmbeddingModelName,
  installed: boolean,
): LocalEmbeddingModelStatus {
  return {
    modelName,
    displayName: modelName,
    providerName: 'Provider',
    providerInitials: 'PR',
    tier: 'large',
    dimensions: 1024,
    language: 'English',
    installed,
    cachedBytes: 0,
    selectedBookCount: 0,
  };
}
