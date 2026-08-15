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
    bookRepository: { getEmbeddingModel: vi.fn() },
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
});
