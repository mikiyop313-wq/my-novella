/** Verifies local-model IPC registration, progress routing, and uninstall payload forwarding. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => unknown>(),
    getStatus: vi.fn(),
    download: vi.fn(),
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
        getStatus: mocks.getStatus,
        download: mocks.download,
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

    it('registers status, download, and uninstall handlers', () => {
        expect([...mocks.handlers.keys()]).toEqual([
            'vectors:local-model:get-status',
            'vectors:local-model:download',
            'vectors:local-model:uninstall',
        ]);
    });

    it('sends download progress only through the initiating renderer', async () => {
        const sender = { send: vi.fn() };
        const otherSender = { send: vi.fn() };
        mocks.download.mockImplementationOnce(async onProgress => {
            onProgress({ status: 'progress', file: 'model.onnx', progress: 25 });
            return { modelName: 'model', installed: true, cachedBytes: 10 };
        });

        await mocks.handlers.get('vectors:local-model:download')?.({ sender });

        expect(sender.send).toHaveBeenCalledWith(
            'vectors:local-model:download-progress',
            { status: 'progress', file: 'model.onnx', progress: 25 },
        );
        expect(otherSender.send).not.toHaveBeenCalled();
    });

    it('forwards uninstall vector-cleanup selection', async () => {
        await mocks.handlers.get('vectors:local-model:uninstall')?.(
            {},
            { clearVectors: true },
        );
        expect(mocks.uninstall).toHaveBeenCalledWith({ clearVectors: true });
    });
});
