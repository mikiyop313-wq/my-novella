import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
const netFetch = vi.hoisted(() => vi.fn());
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
    net: { fetch: netFetch },
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
        netFetch.mockReset();
    });
    afterEach(() => vi.restoreAllMocks());

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
        netFetch.mockResolvedValueOnce(Response.json({ data: [] }))
            .mockResolvedValueOnce(streamResponse([
                'data: {"choices":[{"delta":{"content":"Draft"}}]}\n\n',
                'data: [DONE]\n\n',
            ]));
        await aiService.testConnection('venice');
        await expect(aiService.generatePrompt({ model: 'venice', modelId: 'test-model', prompt: 'Write.' }))
            .resolves.toEqual({ text: 'Draft', modelUsed: 'test-model' });
        expect(netFetch).toHaveBeenCalledTimes(2);
    });

    it('includes configured Venice models and capabilities in the shared catalog', async () => {
        await aiConfigurationService.saveApiKey('venice', 'secret');
        netFetch.mockResolvedValue(Response.json({ data: [{
            id: 'test-model', type: 'text',
            model_spec: { name: 'Test model', capabilities: {
                supportsReasoning: true, supportsReasoningEffort: false,
            } },
        }] }));
        expect((await aiConfigurationService.loadConfiguration()).apiKeys.venice.configured).toBe(true);
        expect((await aiService.listModels()).find(provider => provider.id === 'venice')).toEqual({
            id: 'venice', name: 'Venice', state: 'ready', models: [{
                id: 'venice/test-model', name: 'Test model', provider: 'venice',
                providerName: 'Venice', source: 'direct',
                supportsReasoning: true, supportsReasoningEffort: false,
            }],
        });
    });

    it('includes unconfigured Venice without fetching its models', async () => {
        expect((await aiService.listModels()).find(provider => provider.id === 'venice'))
            .toEqual({ id: 'venice', name: 'Venice', state: 'unconfigured', models: [] });
        expect(netFetch).not.toHaveBeenCalled();
    });

    it('reports a Venice catalog error without discarding other provider groups', async () => {
        await aiConfigurationService.saveApiKey('venice', 'secret');
        netFetch.mockRejectedValue(new Error('Connection failed'));
        const groups = await aiService.listModels();
        expect(groups.find(provider => provider.id === 'venice'))
            .toEqual({ id: 'venice', name: 'Venice', state: 'error', models: [] });
        expect(groups.find(provider => provider.id === 'openai')?.state).toBe('unconfigured');
    });
});
