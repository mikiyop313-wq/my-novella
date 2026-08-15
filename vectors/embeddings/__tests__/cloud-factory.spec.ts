import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    openAiConfigs: [] as any[],
    voyageConfigs: [] as any[],
}));

vi.mock('electron', () => ({
    app: { getPath: () => 'C:/user-data' },
    safeStorage: {},
}));
vi.mock('../../../db/repositories/book.repository', () => ({
    bookRepository: { getEmbeddingModel: vi.fn(), getLocalEmbeddingModel: vi.fn() },
}));
vi.mock('../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock('../providers/openai', () => ({
    OpenAIEmbeddingProvider: class {
        constructor(config: unknown) { mocks.openAiConfigs.push(config); }
    },
}));
vi.mock('../providers/voyage', () => ({
    VoyageEmbeddingProvider: class {
        constructor(config: unknown) { mocks.voyageConfigs.push(config); }
    },
}));

import { getCloudEmbeddingProvider } from '../factory';

describe('embedding provider factory cloud credentials', () => {
    beforeEach(() => {
        mocks.openAiConfigs.length = 0;
        mocks.voyageConfigs.length = 0;
    });

    it('maps provider IDs and passes the saved keys to cloud providers', async () => {
        const keys = { getApiKey: vi.fn(async (providerId: string) => `${providerId}-secret`) };

        await getCloudEmbeddingProvider('openai', keys as any);
        await getCloudEmbeddingProvider('voyage', keys as any);

        expect(mocks.openAiConfigs[0]).toEqual(expect.objectContaining({
            type: 'openai',
            modelName: 'text-embedding-3-large',
            dimensions: 3072,
            apiKey: 'openai-secret',
        }));
        expect(mocks.voyageConfigs[0]).toEqual(expect.objectContaining({
            type: 'voyage',
            modelName: 'voyage-3',
            apiKey: 'voyage-secret',
        }));
    });

    it('fails explicitly when the selected cloud provider has no credential', async () => {
        await expect(getCloudEmbeddingProvider('openai', {
            getApiKey: vi.fn().mockResolvedValue(null),
        } as any)).rejects.toThrow('selected openAI embedding provider is not configured');
    });

    it('reads the credential for every construction so replacements take effect immediately', async () => {
        const getApiKey = vi.fn()
            .mockResolvedValueOnce('first-key')
            .mockResolvedValueOnce('replacement-key');

        await getCloudEmbeddingProvider('voyage', { getApiKey } as any);
        await getCloudEmbeddingProvider('voyage', { getApiKey } as any);

        expect(mocks.voyageConfigs.map(config => config.apiKey)).toEqual([
            'first-key',
            'replacement-key',
        ]);
    });
});
