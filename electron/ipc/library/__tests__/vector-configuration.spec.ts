import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => unknown>(),
    loadConfiguration: vi.fn(),
    loadApiKey: vi.fn(),
    saveApiKey: vi.fn(),
    testConnection: vi.fn(),
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
            mocks.handlers.set(channel, handler);
        }),
    },
}));

vi.mock('../../../domain/vector/vector-configuration.service', () => ({
    vectorConfigurationService: {
        loadConfiguration: mocks.loadConfiguration,
        loadApiKey: mocks.loadApiKey,
        saveApiKey: mocks.saveApiKey,
        testConnection: mocks.testConnection,
    },
}));

import { setupVectorConfigurationHandlers } from '../vector-configuration';

describe('vector configuration IPC handlers', () => {
    beforeEach(() => {
        mocks.handlers.clear();
        vi.clearAllMocks();
        setupVectorConfigurationHandlers();
    });

    it('registers all vector configuration channels', () => {
        expect([...mocks.handlers.keys()]).toEqual([
            'vectors:config:load',
            'vectors:config:load-api-key',
            'vectors:config:save-api-key',
            'vectors:config:test-connection',
        ]);
    });

    it('delegates valid save and connection-test requests', async () => {
        const saveRequest = { providerId: 'openai', apiKey: 'secret' };
        await mocks.handlers.get('vectors:config:save-api-key')?.({}, saveRequest);
        await mocks.handlers.get('vectors:config:test-connection')?.({}, { providerId: 'voyage' });

        expect(mocks.saveApiKey).toHaveBeenCalledWith('openai', 'secret');
        expect(mocks.testConnection).toHaveBeenCalledWith('voyage');
    });

    it.each([
        ['vectors:config:load-api-key', undefined],
        ['vectors:config:save-api-key', { providerId: 'openai' }],
        ['vectors:config:test-connection', { providerId: 1 }],
    ])('rejects malformed requests for %s', async (channel, request) => {
        await expect(async () => mocks.handlers.get(channel)?.({}, request)).rejects.toThrow(
            'Invalid vector',
        );
    });
});
