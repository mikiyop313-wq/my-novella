import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    safeStorage: {
        isEncryptionAvailable: vi.fn().mockReturnValue(true),
        encryptString: vi.fn(),
        decryptString: vi.fn(),
    },
}));
vi.mock('../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn() },
}));

import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import type { AiCloudProviderId } from '../../../shared/models/ai.model';
import { AiConfigurationService } from './ai-configuration.service';
import type { ApiKeyService } from './api-key.service';

class MemorySettingsStore implements AppSettingsStore {
    readonly values = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async set(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.values.delete(key);
    }
}

describe('AiConfigurationService', () => {
    let store: MemorySettingsStore;
    let keyStatuses: Map<AiCloudProviderId, { configured: boolean; suffix: string | null }>;
    let service: AiConfigurationService;

    beforeEach(() => {
        store = new MemorySettingsStore();
        keyStatuses = new Map();
        const keys = {
            getApiKeyStatus: vi.fn(async (providerId: AiCloudProviderId) =>
                keyStatuses.get(providerId) ?? { configured: false, suffix: null },
            ),
            saveApiKey: vi.fn(),
        } as unknown as ApiKeyService;
        service = new AiConfigurationService(store, keys);
    });

    it('loads every cloud status and local server URL', async () => {
        keyStatuses.set('openrouter', { configured: true, suffix: 'abcd' });
        store.values.set('ai.serverUrl.ollama', 'http://localhost:11434');

        await expect(service.loadConfiguration()).resolves.toMatchObject({
            apiKeys: {
                openrouter: { configured: true, suffix: 'abcd' },
                google: { configured: false, suffix: null },
                openai: { configured: false, suffix: null },
                anthropic: { configured: false, suffix: null },
            },
            serverUrls: {
                ollama: 'http://localhost:11434',
                'lm-studio': null,
            },
        });
    });

    it('trims and replaces one server URL per local provider', async () => {
        await service.saveServerUrl('ollama', '  http://localhost:11434  ');
        await service.saveServerUrl('ollama', 'https://local.example/v1');

        expect(store.values.size).toBe(1);
        expect(store.values.get('ai.serverUrl.ollama')).toBe('https://local.example/v1');
    });

    it('rejects empty, relative, and non-HTTP server URLs', async () => {
        await expect(service.saveServerUrl('ollama', '   ')).rejects.toThrow('required');
        await expect(service.saveServerUrl('ollama', '/relative')).rejects.toThrow(
            'valid absolute',
        );
        await expect(service.saveServerUrl('lm-studio', 'file:///tmp/model')).rejects.toThrow(
            'HTTP or HTTPS',
        );
        expect(store.values.size).toBe(0);
    });
});
