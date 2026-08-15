import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    openAiConfigs: [] as any[],
    voyageConfigs: [] as any[],
    openRouterConfigs: [] as any[],
    getEmbeddingModel: vi.fn(),
    getLocalEmbeddingModel: vi.fn(),
    getOpenRouterEmbeddingModel: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { getPath: () => 'C:/user-data' },
    safeStorage: {},
}));
vi.mock('../../../db/repositories/book.repository', () => ({
    bookRepository: {
        getEmbeddingModel: mocks.getEmbeddingModel,
        getLocalEmbeddingModel: mocks.getLocalEmbeddingModel,
        getOpenRouterEmbeddingModel: mocks.getOpenRouterEmbeddingModel,
    },
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
vi.mock('../providers/openrouter', () => ({
    OpenRouterEmbeddingProvider: class {
        constructor(config: unknown) { mocks.openRouterConfigs.push(config); }
    },
}));

import {
    getCloudEmbeddingProvider,
    getEmbeddingProvider,
    getOpenRouterEmbeddingProvider,
} from '../factory';

describe('embedding provider factory cloud credentials', () => {
    beforeEach(() => {
        mocks.openAiConfigs.length = 0;
        mocks.voyageConfigs.length = 0;
        mocks.openRouterConfigs.length = 0;
        vi.clearAllMocks();
    });

    it('constructs the exact curated OpenRouter model with its isolated credential', async () => {
        const keys = { getApiKey: vi.fn().mockResolvedValue('openrouter-secret') };

        await getOpenRouterEmbeddingProvider('qwen/qwen3-embedding-4b', keys as any);

        expect(keys.getApiKey).toHaveBeenCalledWith('openrouter');
        expect(mocks.openRouterConfigs[0]).toEqual(expect.objectContaining({
            type: 'openrouter',
            modelName: 'qwen/qwen3-embedding-4b',
            dimensions: 2560,
            apiKey: 'openrouter-secret',
        }));
    });

    it('fails explicitly when OpenRouter has no credential', async () => {
        await expect(getOpenRouterEmbeddingProvider('openai/text-embedding-3-small', {
            getApiKey: vi.fn().mockResolvedValue(null),
        } as any)).rejects.toThrow('selected openRouter embedding provider is not configured');
    });

    it('does not choose an OpenRouter model when the book selection is null', async () => {
        mocks.getEmbeddingModel.mockResolvedValue('openRouter');
        mocks.getOpenRouterEmbeddingModel.mockResolvedValue(null);

        await expect(getEmbeddingProvider('book-1')).rejects.toThrow(
            'OpenRouter embedding provider has no model selected',
        );
        expect(mocks.openRouterConfigs).toEqual([]);
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

    it('reads the latest OpenRouter credential for every construction', async () => {
        const getApiKey = vi.fn()
            .mockResolvedValueOnce('first-openrouter-key')
            .mockResolvedValueOnce('replacement-openrouter-key');

        await getOpenRouterEmbeddingProvider('voyageai/voyage-4', { getApiKey } as any);
        await getOpenRouterEmbeddingProvider('voyageai/voyage-4', { getApiKey } as any);

        expect(getApiKey).toHaveBeenNthCalledWith(1, 'openrouter');
        expect(getApiKey).toHaveBeenNthCalledWith(2, 'openrouter');
        expect(mocks.openRouterConfigs.map(config => config.apiKey)).toEqual([
            'first-openrouter-key',
            'replacement-openrouter-key',
        ]);
    });
});
