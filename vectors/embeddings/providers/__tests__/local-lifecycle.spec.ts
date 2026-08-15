/** Verifies local-only loading, retry, active-work draining, and provider disposal. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    access: vi.fn(),
    pipeline: vi.fn(),
    env: {} as Record<string, unknown>,
}));

vi.mock('fs/promises', () => ({ access: mocks.access }));
vi.mock('@xenova/transformers', () => ({
    env: mocks.env,
    pipeline: mocks.pipeline,
}));

import {
    LocalEmbeddingModelNotInstalledError,
    LocalEmbeddingProvider,
} from '../local';

describe('LocalEmbeddingProvider lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const key of Object.keys(mocks.env)) delete mocks.env[key];
    });

    it('requires the installation marker and never downloads during ordinary embedding', async () => {
        mocks.access.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        const provider = createProvider();

        await expect(provider.embedQuery('A silver key')).rejects.toBeInstanceOf(
            LocalEmbeddingModelNotInstalledError,
        );
        expect(mocks.pipeline).not.toHaveBeenCalled();
        expect(mocks.env['allowRemoteModels']).not.toBe(true);
    });

    it('loads installed models with local-only pipeline access', async () => {
        mocks.access.mockResolvedValueOnce(undefined);
        const embedder = createEmbedder([0.25, 0.75]);
        mocks.pipeline.mockResolvedValueOnce(embedder);
        const provider = createProvider();

        await expect(provider.embedQuery('A silver key')).resolves.toEqual([0.25, 0.75]);
        expect(mocks.pipeline).toHaveBeenCalledWith(
            'feature-extraction',
            'mixedbread-ai/mxbai-embed-large-v1',
            expect.objectContaining({ local_files_only: true }),
        );
        expect(mocks.env['allowRemoteModels']).toBe(false);
    });

    it('resets failed initialization so an explicit download can be retried', async () => {
        const failure = new Error('network failed');
        mocks.pipeline.mockRejectedValueOnce(failure);
        mocks.pipeline.mockResolvedValueOnce(createEmbedder([0.25, 0.75]));
        const provider = createProvider();

        await expect(provider.download()).rejects.toThrow('network failed');
        await expect(provider.download()).resolves.toBeUndefined();
        expect(mocks.pipeline).toHaveBeenCalledTimes(2);
        expect(mocks.pipeline.mock.calls[1][2]).toEqual(
            expect.objectContaining({ local_files_only: false }),
        );
    });

    it('waits for active embeddings before disposing and rejects new work', async () => {
        mocks.access.mockResolvedValue(undefined);
        let resolveEmbedding!: (value: { data: Float32Array }) => void;
        const embedding = new Promise<{ data: Float32Array }>(resolve => {
            resolveEmbedding = resolve;
        });
        const embedder = vi.fn().mockReturnValue(embedding) as ReturnType<typeof createEmbedder>;
        embedder.dispose = vi.fn().mockResolvedValue(undefined);
        mocks.pipeline.mockResolvedValueOnce(embedder);
        const provider = createProvider();

        const activeEmbedding = provider.embedQuery('first');
        await vi.waitFor(() => expect(embedder).toHaveBeenCalledOnce());

        const disposal = provider.dispose();
        await expect(provider.embedQuery('second')).rejects.toThrow('being uninstalled');
        expect(embedder.dispose).not.toHaveBeenCalled();

        resolveEmbedding({ data: new Float32Array([0.25, 0.75]) });
        await expect(activeEmbedding).resolves.toEqual([0.25, 0.75]);
        await disposal;
        expect(embedder.dispose).toHaveBeenCalledOnce();
    });
});

function createProvider(): LocalEmbeddingProvider {
    return new LocalEmbeddingProvider({
        type: 'local',
        modelName: 'mixedbread-ai/mxbai-embed-large-v1',
        dimensions: 2,
        cacheDir: 'C:/models',
        installationMarkerPath: 'C:/models/mixedbread-ai/mxbai-embed-large-v1/.installed',
    });
}

function createEmbedder(values: number[]) {
    const embedder = vi.fn().mockResolvedValue({ data: new Float32Array(values) });
    return Object.assign(embedder, {
        dispose: vi.fn().mockResolvedValue(undefined),
    });
}
