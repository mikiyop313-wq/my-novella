import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeStorage = vi.hoisted(() => ({
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
}));

vi.mock('electron', () => ({ safeStorage }));
vi.mock('../../../db/repositories/app-settings.repository', () => ({
    appSettingsRepository: { get: vi.fn(), set: vi.fn() },
}));

import type { AppSettingsStore } from '../../../db/repositories/app-settings.repository';
import { ApiKeyService } from './api-key.service';

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

describe('ApiKeyService', () => {
    let store: MemorySettingsStore;
    let service: ApiKeyService;

    beforeEach(() => {
        store = new MemorySettingsStore();
        service = new ApiKeyService(store);
        safeStorage.isEncryptionAvailable.mockReset().mockReturnValue(true);
        safeStorage.encryptString.mockReset().mockImplementation((value: string) =>
            Buffer.from(`encrypted:${value}`),
        );
        safeStorage.decryptString.mockReset().mockImplementation((value: Buffer) =>
            value.toString().replace(/^encrypted:/, ''),
        );
    });

    it('encrypts and upserts one API key per provider without persisting plaintext', async () => {
        await expect(service.saveApiKey('openai', '  sk-first-1234  ')).resolves.toEqual({
            configured: true,
            suffix: '1234',
        });
        await service.saveApiKey('openai', 'sk-replacement-5678');

        expect(store.values.size).toBe(1);
        const savedValue = store.values.get('ai.apiKey.openai');
        expect(savedValue).toBe(Buffer.from('encrypted:sk-replacement-5678').toString('base64'));
        expect(savedValue).not.toContain('sk-replacement-5678');
    });

    it('decrypts in the main process and returns only configuration status and suffix', async () => {
        store.values.set(
            'ai.apiKey.anthropic',
            Buffer.from('encrypted:sk-ant-secret-abcd').toString('base64'),
        );

        await expect(service.getApiKeyStatus('anthropic')).resolves.toEqual({
            configured: true,
            suffix: 'abcd',
        });
        expect(safeStorage.decryptString).toHaveBeenCalledOnce();
    });

    it('returns the decrypted key when the selected provider requests editing', async () => {
        store.values.set(
            'ai.apiKey.openrouter',
            Buffer.from('encrypted:sk-or-full-secret-9876').toString('base64'),
        );

        await expect(service.getApiKey('openrouter')).resolves.toBe('sk-or-full-secret-9876');
    });

    it('reports providers without a saved key as unconfigured', async () => {
        await expect(service.getApiKeyStatus('google')).resolves.toEqual({
            configured: false,
            suffix: null,
        });
    });

    it('deletes the encrypted entry when the complete API key is cleared', async () => {
        store.values.set(
            'ai.apiKey.openrouter',
            Buffer.from('encrypted:sk-or-secret').toString('base64'),
        );

        await expect(service.saveApiKey('openrouter', '   ')).resolves.toEqual({
            configured: false,
            suffix: null,
        });

        expect(store.values.has('ai.apiKey.openrouter')).toBe(false);
        expect(safeStorage.encryptString).not.toHaveBeenCalled();
    });

    it('rejects saving when secure storage is unavailable without writing data', async () => {
        safeStorage.isEncryptionAvailable.mockReturnValue(false);

        await expect(service.saveApiKey('openrouter', 'sk-or-secret')).rejects.toThrow(
            'Secure credential storage is unavailable',
        );
        expect(store.values.size).toBe(0);
    });
});
