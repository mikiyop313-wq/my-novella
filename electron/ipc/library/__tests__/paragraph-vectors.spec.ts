import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  isBookIndexingAvailable: vi.fn(),
  getAutomaticIndexingEnabled: vi.fn(),
  runBookOperation: vi.fn(),
  searchSimilar: vi.fn(),
  getBookIndexSizes: vi.fn(),
  clearBookIndex: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
  manuscriptVectorIndexService: {
    isBookIndexingAvailable: mocks.isBookIndexingAvailable,
    runBookOperation: mocks.runBookOperation,
    searchSimilar: mocks.searchSimilar,
    getBookIndexSizes: mocks.getBookIndexSizes,
    clearBookIndex: mocks.clearBookIndex,
  },
}));

vi.mock('../../../../vectors/repositories/paragraph-vector.repository', () => ({
  paragraphVectorRepository: {},
}));

vi.mock('../../../../db/repositories/book.repository', () => ({
  bookRepository: {
    getAutomaticIndexingEnabled: mocks.getAutomaticIndexingEnabled,
  },
}));

vi.mock('../../../../vectors/embeddings/factory', () => ({
  getEmbeddingProvider: vi.fn(),
}));

vi.mock('../../../../db', () => ({
  db: { query: { scene: { findMany: vi.fn() } } },
}));

import { setupVectorHandlers } from '../paragraph-vectors';

describe('paragraph vector IPC availability gate', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    mocks.isBookIndexingAvailable.mockResolvedValue(false);
    mocks.getAutomaticIndexingEnabled.mockResolvedValue(true);
    mocks.searchSimilar.mockResolvedValue([]);
    mocks.getBookIndexSizes.mockResolvedValue([]);
    mocks.clearBookIndex.mockResolvedValue(undefined);
    setupVectorHandlers();
  });

  it('skips paragraph upserts when book indexing is unavailable', async () => {
    await mocks.handlers.get('vectors:upsertParagraphs')?.({}, {
      bookId: 'book-1',
      upserts: [{
        paragraphId: 'paragraph-1',
        sceneId: 'scene-1',
        text: 'Paragraph',
        hash: 'hash',
        position: 0,
      }],
    });

    expect(mocks.isBookIndexingAvailable).toHaveBeenCalledWith('book-1');
    expect(mocks.runBookOperation).not.toHaveBeenCalled();
  });

  it('skips paragraph deletes when book indexing is unavailable', async () => {
    await mocks.handlers.get('vectors:deleteParagraphs')?.({}, {
      bookId: 'book-1',
      deletes: [{ paragraphId: 'paragraph-1', sceneId: 'scene-1' }],
    });

    expect(mocks.isBookIndexingAvailable).toHaveBeenCalledWith('book-1');
    expect(mocks.runBookOperation).not.toHaveBeenCalled();
  });

  it('reports indexing availability and the automatic preference for a book', async () => {
    mocks.isBookIndexingAvailable.mockResolvedValueOnce(true);
    mocks.getAutomaticIndexingEnabled.mockResolvedValueOnce(false);

    await expect(mocks.handlers.get('vectors:getBookIndexingConfiguration')?.(
      {},
      { bookId: 'book-1' },
    )).resolves.toEqual({ available: true, automaticIndexingEnabled: false });

    expect(mocks.isBookIndexingAvailable).toHaveBeenCalledWith('book-1');
    expect(mocks.getAutomaticIndexingEnabled).toHaveBeenCalledWith('book-1');
  });

  it('reports retained index sizes for a book', async () => {
    const sizes = [{
      provider: 'local',
      model: 'BAAI/bge-m3',
      paragraphCount: 2,
      estimatedBytes: 9000,
    }];
    mocks.getBookIndexSizes.mockResolvedValueOnce(sizes);

    await expect(mocks.handlers.get('vectors:getBookIndexSizes')?.(
      {},
      { bookId: 'book-1' },
    )).resolves.toEqual(sizes);
    expect(mocks.getBookIndexSizes).toHaveBeenCalledWith('book-1');
  });

  it('validates and clears one retained book index', async () => {
    const payload = {
      bookId: 'book-1',
      provider: 'local',
      model: 'BAAI/bge-m3',
    } as const;

    await expect(mocks.handlers.get('vectors:clearBookIndex')?.({}, payload)).resolves.toBeUndefined();
    expect(mocks.clearBookIndex).toHaveBeenCalledWith(payload);

    await expect(mocks.handlers.get('vectors:clearBookIndex')?.({}, {
      ...payload,
      provider: 'unknown',
    })).rejects.toThrow('Invalid book vector index cleanup request.');
  });

  it('validates and forwards an optional minimum similarity', async () => {
    await mocks.handlers.get('vectors:searchSimilar')?.({}, {
      bookId: 'book-1',
      query: '  silver key  ',
      limit: 3,
      minimumSimilarity: 0.7,
    });

    expect(mocks.searchSimilar).toHaveBeenCalledWith({
      bookId: 'book-1',
      query: 'silver key',
      limit: 3,
      minimumSimilarity: 0.7,
    });

    await expect(mocks.handlers.get('vectors:searchSimilar')?.({}, {
      bookId: 'book-1',
      query: 'silver key',
      minimumSimilarity: 1.01,
    })).rejects.toThrow('Minimum similarity must be a number from 0 through 1.');
  });

  it('clamps paragraph result limits from one through twenty', async () => {
    await mocks.handlers.get('vectors:searchSimilar')?.({}, {
      bookId: 'book-1',
      query: 'silver key',
      limit: 25,
    });
    expect(mocks.searchSimilar).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 20 }));

    await mocks.handlers.get('vectors:searchSimilar')?.({}, {
      bookId: 'book-1',
      query: 'silver key',
      limit: 0,
    });
    expect(mocks.searchSimilar).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
  });
});
