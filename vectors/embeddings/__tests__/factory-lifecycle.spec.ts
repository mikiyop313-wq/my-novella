/** Verifies provider cache invalidation and creation blocking during local-model uninstall. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    dispose: vi.fn(),
    localProviderConstructor: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { getPath: () => 'C:/user-data' },
}));

vi.mock('../../../db/repositories/book.repository', () => ({
    bookRepository: { getEmbeddingModel: vi.fn(), getLocalEmbeddingModel: vi.fn() },
}));

vi.mock('../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

vi.mock('../providers/local', () => ({
    LocalEmbeddingProvider: class {
        dispose = mocks.dispose;
        constructor(config: unknown) {
            mocks.localProviderConstructor(config);
        }
    },
}));

import {
    getLocalEmbeddingProvider,
    releaseLocalEmbeddingProvider,
    restoreLocalEmbeddingProviderAccess,
} from '../factory';

describe('embedding provider factory local lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.dispose.mockResolvedValue(undefined);
        restoreLocalEmbeddingProviderAccess();
    });

    it('invalidates and blocks local provider creation until uninstall finishes', async () => {
        const first = getLocalEmbeddingProvider();

        await releaseLocalEmbeddingProvider();

        expect(mocks.dispose).toHaveBeenCalledOnce();
        expect(() => getLocalEmbeddingProvider()).toThrow('being uninstalled');

        restoreLocalEmbeddingProviderAccess();
        const second = getLocalEmbeddingProvider();
        expect(second).not.toBe(first);
        expect(mocks.localProviderConstructor).toHaveBeenCalledTimes(2);
    });

    it('creates and releases providers independently for exact local models', async () => {
        const bge = getLocalEmbeddingProvider('BAAI/bge-m3');
        const mixedbread = getLocalEmbeddingProvider('mixedbread-ai/mxbai-embed-large-v1');

        expect(bge).not.toBe(mixedbread);
        expect(mocks.localProviderConstructor).toHaveBeenCalledWith(
            expect.objectContaining({ modelName: 'BAAI/bge-m3', dimensions: 1024 }),
        );

        await releaseLocalEmbeddingProvider('BAAI/bge-m3');
        expect(() => getLocalEmbeddingProvider('BAAI/bge-m3')).toThrow('being uninstalled');
        expect(getLocalEmbeddingProvider('mixedbread-ai/mxbai-embed-large-v1')).toBe(mixedbread);
        restoreLocalEmbeddingProviderAccess('BAAI/bge-m3');
    });
});
