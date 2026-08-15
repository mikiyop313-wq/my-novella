import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  isBookIndexingAvailable: vi.fn(),
  runBookOperation: vi.fn(),
  searchSimilar: vi.fn(),
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
  },
}));

vi.mock('../../../../vectors/repositories/paragraph-vector.repository', () => ({
  paragraphVectorRepository: {},
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
    mocks.searchSimilar.mockResolvedValue([]);
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
});
