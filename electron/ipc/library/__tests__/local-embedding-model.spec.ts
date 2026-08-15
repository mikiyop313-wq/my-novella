/** Verifies local-model IPC registration, progress routing, and uninstall payload forwarding. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getStatuses: vi.fn(),
  download: vi.fn(),
  cancelActiveDownload: vi.fn(),
  uninstall: vi.fn(),
  getStatus: vi.fn(),
  getLocalEmbeddingModel: vi.fn(),
  selectLocalModel: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../../../vectors/embeddings/local-model-manager', () => ({
  localEmbeddingModelManager: {
    getStatuses: mocks.getStatuses,
    download: mocks.download,
    cancelActiveDownload: mocks.cancelActiveDownload,
    uninstall: mocks.uninstall,
    getStatus: mocks.getStatus,
  },
}));

vi.mock('../../../../db/repositories/book.repository', () => ({
  bookRepository: { getLocalEmbeddingModel: mocks.getLocalEmbeddingModel },
}));

vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
  manuscriptVectorIndexService: { selectLocalModel: mocks.selectLocalModel },
}));

import { setupLocalEmbeddingModelHandlers } from '../local-embedding-model';

describe('local embedding model IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    mocks.getStatus.mockResolvedValue({
      modelName: 'BAAI/bge-m3',
      displayName: 'BGE-M3',
      installed: true,
    });
    setupLocalEmbeddingModelHandlers();
  });

  it('registers status, download cancellation, and uninstall handlers', () => {
    expect([...mocks.handlers.keys()]).toEqual([
      'vectors:local-model:get-status',
      'vectors:local-model:download',
      'vectors:local-model:cancel-download',
      'vectors:local-model:uninstall',
      'vectors:local-model:get-book-selection',
      'vectors:local-model:select-for-book',
    ]);
  });

  it('forwards active download cancellation', async () => {
    await mocks.handlers.get('vectors:local-model:cancel-download')?.({});
    expect(mocks.cancelActiveDownload).toHaveBeenCalledOnce();
  });

  it('returns the exact local model selected by a book', async () => {
    mocks.getLocalEmbeddingModel.mockResolvedValueOnce('BAAI/bge-m3');

    await expect(mocks.handlers.get('vectors:local-model:get-book-selection')?.(
      {},
      { bookId: 'book-1' },
    )).resolves.toEqual({ bookId: 'book-1', modelName: 'BAAI/bge-m3' });
  });

  it('sends download progress only through the initiating renderer', async () => {
    const sender = { send: vi.fn() };
    const otherSender = { send: vi.fn() };
    mocks.download.mockImplementationOnce(async (_payload, onProgress) => {
      onProgress({
        modelName: 'BAAI/bge-m3',
        status: 'progress',
        file: 'model.onnx',
        progress: 25,
      });
      return { modelName: 'model', installed: true, cachedBytes: 10 };
    });

    await mocks.handlers.get('vectors:local-model:download')?.(
      { sender },
      { modelName: 'BAAI/bge-m3' },
    );

    expect(mocks.download).toHaveBeenCalledWith({ modelName: 'BAAI/bge-m3' }, expect.any(Function));

    expect(sender.send).toHaveBeenCalledWith('vectors:local-model:download-progress', {
      modelName: 'BAAI/bge-m3',
      status: 'progress',
      file: 'model.onnx',
      progress: 25,
    });
    expect(otherSender.send).not.toHaveBeenCalled();
  });

  it('forwards uninstall vector-cleanup selection', async () => {
    await mocks.handlers.get('vectors:local-model:uninstall')?.(
      {},
      { modelName: 'BAAI/bge-m3', clearVectors: true },
    );
    expect(mocks.uninstall).toHaveBeenCalledWith({
      modelName: 'BAAI/bge-m3',
      clearVectors: true,
    });
  });

  it('persists selection through the index service and routes reindex progress', async () => {
    const sender = { send: vi.fn() };
    mocks.selectLocalModel.mockImplementationOnce(async (_bookId, _modelName, _reindex, onProgress) => {
      onProgress({
        bookId: 'book-1',
        modelName: 'BAAI/bge-m3',
        processedParagraphs: 2,
        totalParagraphs: 5,
      });
      return { bookId: 'book-1', modelName: 'BAAI/bge-m3' };
    });

    await mocks.handlers.get('vectors:local-model:select-for-book')?.(
      { sender },
      { bookId: 'book-1', modelName: 'BAAI/bge-m3', reindex: true },
    );

    expect(mocks.selectLocalModel).toHaveBeenCalledWith(
      'book-1',
      'BAAI/bge-m3',
      true,
      expect.any(Function),
    );
    expect(sender.send).toHaveBeenCalledWith('vectors:local-model:reindex-progress', {
      bookId: 'book-1',
      modelName: 'BAAI/bge-m3',
      processedParagraphs: 2,
      totalParagraphs: 5,
    });
  });

  it('rejects selecting a local model that is not installed', async () => {
    mocks.getStatus.mockResolvedValueOnce({
      modelName: 'BAAI/bge-m3',
      displayName: 'BGE-M3',
      installed: false,
    });

    await expect(mocks.handlers.get('vectors:local-model:select-for-book')?.(
      { sender: { send: vi.fn() } },
      { bookId: 'book-1', modelName: 'BAAI/bge-m3', reindex: true },
    )).rejects.toThrow('must be installed');
    expect(mocks.selectLocalModel).not.toHaveBeenCalled();
  });
});
