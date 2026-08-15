/** Verifies local-model IPC registration, progress routing, and uninstall payload forwarding. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getStatuses: vi.fn(),
  download: vi.fn(),
  cancelActiveDownload: vi.fn(),
  uninstall: vi.fn(),
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
  },
}));

import { setupLocalEmbeddingModelHandlers } from '../local-embedding-model';

describe('local embedding model IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupLocalEmbeddingModelHandlers();
  });

  it('registers status, download cancellation, and uninstall handlers', () => {
    expect([...mocks.handlers.keys()]).toEqual([
      'vectors:local-model:get-status',
      'vectors:local-model:download',
      'vectors:local-model:cancel-download',
      'vectors:local-model:uninstall',
    ]);
  });

  it('forwards active download cancellation', async () => {
    await mocks.handlers.get('vectors:local-model:cancel-download')?.({});
    expect(mocks.cancelActiveDownload).toHaveBeenCalledOnce();
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
});
