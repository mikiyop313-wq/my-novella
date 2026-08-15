import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getApiKeyStatus: vi.fn(),
  loadApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  testConnection: vi.fn(),
  getOpenRouterEmbeddingModel: vi.fn(),
  selectOpenRouterModel: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));
vi.mock('../../../domain/vector/vector-api-key.service', () => ({
  vectorApiKeyService: {
    getApiKeyStatus: mocks.getApiKeyStatus,
    getApiKey: mocks.loadApiKey,
    saveApiKey: mocks.saveApiKey,
  },
}));
vi.mock('../../../domain/vector/openrouter-connection', () => ({
  testOpenRouterConnection: mocks.testConnection,
}));
vi.mock('../../../../db/repositories/book.repository', () => ({
  bookRepository: { getOpenRouterEmbeddingModel: mocks.getOpenRouterEmbeddingModel },
}));
vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
  manuscriptVectorIndexService: { selectOpenRouterModel: mocks.selectOpenRouterModel },
}));

import { setupOpenRouterEmbeddingModelHandlers } from '../openrouter-embedding-model';

describe('OpenRouter embedding IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupOpenRouterEmbeddingModelHandlers();
  });

  it('registers the backend-only OpenRouter channels', () => {
    expect([...mocks.handlers.keys()]).toEqual([
      'vectors:openrouter:get-api-key-status',
      'vectors:openrouter:load-api-key',
      'vectors:openrouter:save-api-key',
      'vectors:openrouter:test-connection',
      'vectors:openrouter:get-models',
      'vectors:openrouter:get-book-selection',
      'vectors:openrouter:select-for-book',
    ]);
  });

  it('returns the static catalog and a nullable book selection', async () => {
    mocks.getOpenRouterEmbeddingModel.mockResolvedValue(null);

    const models = await mocks.handlers.get('vectors:openrouter:get-models')?.({});
    expect(models).toHaveLength(10);
    await expect(mocks.handlers.get('vectors:openrouter:get-book-selection')?.(
      {},
      { bookId: 'book-1' },
    )).resolves.toEqual({ bookId: 'book-1', modelName: null });
  });

  it('delegates credential operations and explicit model selection with progress', async () => {
    const sender = { send: vi.fn() };
    await mocks.handlers.get('vectors:openrouter:get-api-key-status')?.({});
    await mocks.handlers.get('vectors:openrouter:load-api-key')?.({});
    await mocks.handlers.get('vectors:openrouter:save-api-key')?.({}, { apiKey: 'secret' });
    await mocks.handlers.get('vectors:openrouter:test-connection')?.({});
    mocks.selectOpenRouterModel.mockImplementationOnce(
      async (_bookId, _modelName, _reindex, onProgress) => {
        onProgress({
          bookId: 'book-1',
          modelName: 'qwen/qwen3-embedding-4b',
          processedParagraphs: 1,
          totalParagraphs: 2,
        });
      },
    );

    await mocks.handlers.get('vectors:openrouter:select-for-book')?.(
      { sender },
      { bookId: 'book-1', modelName: 'qwen/qwen3-embedding-4b', reindex: true },
    );

    expect(mocks.getApiKeyStatus).toHaveBeenCalledWith('openrouter');
    expect(mocks.loadApiKey).toHaveBeenCalledWith('openrouter');
    expect(mocks.saveApiKey).toHaveBeenCalledWith('openrouter', 'secret');
    expect(mocks.testConnection).toHaveBeenCalledOnce();
    expect(mocks.selectOpenRouterModel).toHaveBeenCalledWith(
      'book-1',
      'qwen/qwen3-embedding-4b',
      true,
      expect.any(Function),
    );
    expect(sender.send).toHaveBeenCalledWith(
      'vectors:openrouter:reindex-progress',
      expect.objectContaining({ processedParagraphs: 1 }),
    );
  });

  it('rejects unsupported model and malformed credential requests', async () => {
    await expect(async () => mocks.handlers.get('vectors:openrouter:save-api-key')?.(
      {},
      {},
    )).rejects.toThrow('Invalid OpenRouter vector API key request');
    await expect(async () => mocks.handlers.get('vectors:openrouter:select-for-book')?.(
      { sender: { send: vi.fn() } },
      { bookId: 'book-1', modelName: 'unsupported/model', reindex: true },
    )).rejects.toThrow('Invalid OpenRouter embedding model selection request');
    await expect(async () => mocks.handlers.get('vectors:openrouter:get-book-selection')?.(
      {},
      { bookId: '' },
    )).rejects.toThrow('Invalid OpenRouter book selection request');
    expect(mocks.selectOpenRouterModel).not.toHaveBeenCalled();
  });
});
