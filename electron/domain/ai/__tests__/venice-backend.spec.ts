import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('../../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: {
        get: async (key: string) => storage.get(key) ?? null,
        set: async (key: string, value: string) => { storage.set(key, value); },
        delete: async (key: string) => { storage.delete(key); },
    },
}));
vi.mock('../../../../db/repositories/system-prompt.repository', () => ({
    systemPromptRepository: { getById: vi.fn() },
}));
vi.mock('electron', () => ({
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
        decryptString: (value: Buffer) => value.toString().slice('encrypted:'.length),
    },
}));

import { aiConfigurationService } from '../ai-configuration.service';
import { aiService } from '../ai.service';
import { streamResponse } from '../providers/__tests__/provider-test-helpers';

describe('Venice backend integration', () => {
    beforeEach(() => {
        storage.clear();
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => vi.unstubAllGlobals());

    it('saves, loads, and clears encrypted Venice credentials through configuration', async () => {
        await expect(aiConfigurationService.saveApiKey('venice', '  secret-1234  ')).resolves.toEqual({
            configured: true, suffix: '1234',
        });
        expect(storage.get('ai.apiKey.venice')).toBe(Buffer.from('encrypted:secret-1234').toString('base64'));
        await expect(aiConfigurationService.loadApiKey('venice')).resolves.toBe('secret-1234');
        await aiConfigurationService.saveApiKey('venice', '');
        expect(storage.has('ai.apiKey.venice')).toBe(false);
        await expect(aiConfigurationService.loadApiKey('venice')).resolves.toBeNull();
    });

    it('routes generation and connection tests through the default provider registration', async () => {
        await aiConfigurationService.saveApiKey('venice', 'secret');
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: [] }))
            .mockResolvedValueOnce(streamResponse([
                'data: {"choices":[{"delta":{"content":"Draft"}}]}\n\n',
                'data: [DONE]\n\n',
            ]));
        await aiService.testConnection('venice');
        await expect(aiService.generatePrompt({ model: 'venice', modelId: 'test-model', prompt: 'Write.' }))
            .resolves.toEqual({ text: 'Draft', modelUsed: 'test-model' });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('keeps Venice out of the shared configuration and model catalogs', async () => {
        await aiConfigurationService.saveApiKey('venice', 'secret');
        const configuration = await aiConfigurationService.loadConfiguration();
        expect(configuration.apiKeys).not.toHaveProperty('venice');
        expect((await aiService.listModels()).map((provider) => provider.id)).not.toContain('venice');
        expect(fetch).not.toHaveBeenCalled();
    });
});
