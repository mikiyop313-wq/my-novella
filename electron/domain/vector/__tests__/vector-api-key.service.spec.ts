import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeStorage = vi.hoisted(() => ({
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
}));

vi.mock('electron', () => ({ safeStorage }));
vi.mock('../../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

import type { AppSettingsStore } from '../../../../db/repositories/app-settings.repository';
import { ApiKeyService } from '../../ai/api-key.service';
import { VectorApiKeyService } from '../vector-api-key.service';

class MemorySettingsStore implements AppSettingsStore {
    readonly values = new Map<string, string>();
    async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
    async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
    async delete(key: string): Promise<void> { this.values.delete(key); }
}

describe('VectorApiKeyService', () => {
    let store: MemorySettingsStore;
    let service: VectorApiKeyService;

    beforeEach(() => {
        store = new MemorySettingsStore();
        service = new VectorApiKeyService(store);
        safeStorage.isEncryptionAvailable.mockReset().mockReturnValue(true);
        safeStorage.encryptString.mockReset().mockImplementation((value: string) =>
            Buffer.from(`encrypted:${value}`),
        );
        safeStorage.decryptString.mockReset().mockImplementation((value: Buffer) =>
            value.toString().replace(/^encrypted:/, ''),
        );
    });

    it('stores vector credentials encrypted and separately by provider', async () => {
        await expect(service.saveApiKey('openai', '  sk-vector-1234  ')).resolves.toEqual({
            configured: true,
            suffix: '1234',
        });
        expect(store.values.get('vectors.apiKey.openai')).toBe(
            Buffer.from('encrypted:sk-vector-1234').toString('base64'),
        );
        expect(store.values.has('ai.apiKey.openai')).toBe(false);

        await service.saveApiKey('openrouter', 'openrouter-vector-5678');
        expect(store.values.get('vectors.apiKey.openrouter')).toBe(
            Buffer.from('encrypted:openrouter-vector-5678').toString('base64'),
        );
        expect(store.values.has('ai.apiKey.openrouter')).toBe(false);
    });

    it.each([
        ['sk-or-shared-1234', 'sk-or-shared-1234'],
        ['sk-or-ai-1234', 'sk-or-vector-5678'],
    ])(
        'keeps AI and vector OpenRouter credentials independent when values are %s and %s',
        async (aiKey, vectorKey) => {
            const aiService = new ApiKeyService(store);

            await aiService.saveApiKey('openrouter', aiKey);
            await service.saveApiKey('openrouter', vectorKey);

            await expect(aiService.getApiKey('openrouter')).resolves.toBe(aiKey);
            await expect(service.getApiKey('openrouter')).resolves.toBe(vectorKey);

            await aiService.saveApiKey('openrouter', '');
            await expect(aiService.getApiKey('openrouter')).resolves.toBeNull();
            await expect(service.getApiKey('openrouter')).resolves.toBe(vectorKey);

            await aiService.saveApiKey('openrouter', aiKey);
            await service.saveApiKey('openrouter', '');
            await expect(aiService.getApiKey('openrouter')).resolves.toBe(aiKey);
            await expect(service.getApiKey('openrouter')).resolves.toBeNull();
        },
    );

    it('decrypts the full key but exposes only status and suffix normally', async () => {
        store.values.set(
            'vectors.apiKey.voyage',
            Buffer.from('encrypted:voyage-secret-abcd').toString('base64'),
        );
        await expect(service.getApiKey('voyage')).resolves.toBe('voyage-secret-abcd');
        await expect(service.getApiKeyStatus('voyage')).resolves.toEqual({
            configured: true,
            suffix: 'abcd',
        });
    });

    it('deletes blank credentials and rejects unsupported providers', async () => {
        store.values.set('vectors.apiKey.openai', 'encrypted');
        await expect(service.saveApiKey('openai', '  ')).resolves.toEqual({
            configured: false,
            suffix: null,
        });
        expect(store.values.has('vectors.apiKey.openai')).toBe(false);
        await expect(service.getApiKey('invalid' as 'openai')).rejects.toThrow(
            'Unsupported cloud vector provider',
        );
    });

    it('does not persist when secure storage is unavailable', async () => {
        safeStorage.isEncryptionAvailable.mockReturnValue(false);
        await expect(service.saveApiKey('openai', 'secret')).rejects.toThrow(
            'Secure credential storage is unavailable',
        );
        expect(store.values.size).toBe(0);
    });
});
