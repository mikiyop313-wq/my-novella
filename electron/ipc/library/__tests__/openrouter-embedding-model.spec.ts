import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
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

  it('delegates explicit model selection with progress', async () => {
    const sender = { send: vi.fn() };
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

  it('rejects unsupported models and malformed book requests', async () => {
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
