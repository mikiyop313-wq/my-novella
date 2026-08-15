import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getCloudEmbeddingProvider: vi.fn(),
}));

vi.mock('electron', () => ({ safeStorage: {} }));
vi.mock('../../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../../../vectors/embeddings/factory', () => ({
    getCloudEmbeddingProvider: mocks.getCloudEmbeddingProvider,
}));

import { VectorConfigurationService } from '../vector-configuration.service';

describe('VectorConfigurationService', () => {
    const keys = {
        getApiKeyStatus: vi.fn(),
        getApiKey: vi.fn(),
        saveApiKey: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        keys.getApiKeyStatus.mockImplementation(async (providerId: string) => ({
            configured: providerId === 'openai',
            suffix: providerId === 'openai' ? '1234' : null,
        }));
    });

    it('loads status for every supported cloud vector provider', async () => {
        const service = new VectorConfigurationService(keys as any);
        await expect(service.loadConfiguration()).resolves.toEqual({
            apiKeys: {
                openai: { configured: true, suffix: '1234' },
                voyage: { configured: false, suffix: null },
            },
        });
    });

    it('tests a provider by generating and validating a query embedding', async () => {
        const provider = {
            space: { provider: 'voyage', model: 'voyage-3', dimensions: 2, revision: '1' },
            embedQuery: vi.fn().mockResolvedValue([1, 2]),
        };
        mocks.getCloudEmbeddingProvider.mockResolvedValue(provider);
        const service = new VectorConfigurationService(keys as any);

        await expect(service.testConnection('voyage')).resolves.toBeUndefined();
        expect(mocks.getCloudEmbeddingProvider).toHaveBeenCalledWith('voyage', keys);
        expect(provider.embedQuery).toHaveBeenCalledWith('My Novella vector connection test');
    });

    it('rejects a connection test that returns incompatible dimensions', async () => {
        mocks.getCloudEmbeddingProvider.mockResolvedValue({
            space: { provider: 'openAI', model: 'model', dimensions: 3, revision: '1' },
            embedQuery: vi.fn().mockResolvedValue([1, 2]),
        });
        const service = new VectorConfigurationService(keys as any);

        await expect(service.testConnection('openai')).rejects.toThrow(
            'Embedding dimension mismatch',
        );
    });
});
