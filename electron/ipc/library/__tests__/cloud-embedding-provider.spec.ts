import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  selectCloudProvider: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));
vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
  manuscriptVectorIndexService: { selectCloudProvider: mocks.selectCloudProvider },
}));

import { setupCloudEmbeddingProviderHandlers } from '../cloud-embedding-provider';

describe('cloud embedding provider IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupCloudEmbeddingProviderHandlers();
  });

  it('delegates provider selection and forwards progress', async () => {
    const sender = { send: vi.fn() };
    mocks.selectCloudProvider.mockImplementationOnce(
      async (_bookId, _providerId, _reindex, onProgress) => {
        onProgress({
          bookId: 'book-1',
          providerId: 'openai',
          processedParagraphs: 1,
          totalParagraphs: 2,
        });
      },
    );

    await mocks.handlers.get('vectors:cloud-provider:select-for-book')?.(
      { sender },
      { bookId: 'book-1', providerId: 'openai', reindex: true },
    );

    expect(mocks.selectCloudProvider).toHaveBeenCalledWith(
      'book-1',
      'openai',
      true,
      expect.any(Function),
    );
    expect(sender.send).toHaveBeenCalledWith(
      'vectors:cloud-provider:reindex-progress',
      expect.objectContaining({ processedParagraphs: 1 }),
    );
  });

  it.each([
    undefined,
    { bookId: '', providerId: 'openai', reindex: true },
    { bookId: 'book-1', providerId: 'openrouter', reindex: true },
    { bookId: 'book-1', providerId: 'openai', reindex: 'yes' },
  ])('rejects malformed selection payloads', async payload => {
    await expect(async () => mocks.handlers.get('vectors:cloud-provider:select-for-book')?.(
      { sender: { send: vi.fn() } },
      payload,
    )).rejects.toThrow('Invalid cloud embedding provider selection request');
  });
});
