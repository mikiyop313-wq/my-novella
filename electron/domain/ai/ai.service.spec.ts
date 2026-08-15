import { describe, expect, it, vi } from 'vitest';

vi.mock('./api-key.service', () => ({
    apiKeyService: { getApiKey: vi.fn() },
}));
vi.mock('./prompt-builder.service', () => ({
    promptBuilderService: { buildChatCompletionPayload: vi.fn() },
}));
vi.mock('./ai-configuration.service', () => ({
    aiConfigurationService: { getServerUrl: vi.fn() },
}));

import type {
    AiModel,
    AiProviderConfiguration,
    AiProviderId,
} from '../../../shared/models/ai.model';
import type { AiProvider } from './providers/ai-provider.interface';
import { AiService } from './ai.service';

describe('AiService', () => {
    it('retains successful model lists when another provider fails', async () => {
        const openAiModel = { id: 'openai/a' } as AiModel;
        const anthropicModel = { id: 'anthropic/b' } as AiModel;
        const providers = [
            fakeProvider('openai', [openAiModel]),
            fakeProvider('gemini', new Error('offline')),
            fakeProvider('anthropic', [anthropicModel]),
        ];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const service = serviceWithConfiguration(providers, ['openai', 'google', 'anthropic']);

        await expect(service.listModels()).resolves.toEqual([
            { id: 'google', name: 'Google Gemini', state: 'error', models: [] },
            { id: 'openai', name: 'openai', state: 'ready', models: [openAiModel] },
            { id: 'anthropic', name: 'anthropic', state: 'ready', models: [anthropicModel] },
        ]);
        expect(providers.every((provider) => vi.mocked(provider.listModels).mock.calls.length === 1))
            .toBe(true);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Google Gemini'),
            expect.any(Error),
        );
        errorSpy.mockRestore();
    });

    it('routes Anthropic generation through its registered provider ID', async () => {
        const provider = fakeProvider('anthropic', []);
        vi.mocked(provider.generate).mockResolvedValue({ text: 'ok', modelUsed: 'claude-a' });
        const service = new AiService([provider]);

        await expect(service.generatePrompt({
            model: 'anthropic', modelId: 'claude-a', prompt: 'Write.',
        })).resolves.toMatchObject({ text: 'ok' });
    });

    it('routes local generation through its registered provider ID', async () => {
        const provider = fakeProvider('ollama', []);
        vi.mocked(provider.generate).mockResolvedValue({ text: 'local', modelUsed: 'llama3.2' });
        const service = new AiService([provider]);

        await expect(service.generatePrompt({
            model: 'ollama', modelId: 'llama3.2', prompt: 'Write.',
        })).resolves.toEqual({ text: 'local', modelUsed: 'llama3.2' });
    });

    it('retains local models when another local server is offline', async () => {
        const ollamaModel = { id: 'ollama/llama3.2' } as AiModel;
        const providers = [
            fakeProvider('ollama', [ollamaModel]),
            fakeProvider('lm-studio', new Error('offline')),
        ];
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const service = serviceWithConfiguration(providers, ['ollama', 'lm-studio']);

        await expect(service.listModels()).resolves.toEqual([
            { id: 'ollama', name: 'ollama', state: 'ready', models: [ollamaModel] },
            { id: 'lm-studio', name: 'lm-studio', state: 'error', models: [] },
        ]);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('lm-studio'),
            expect.any(Error),
        );
        errorSpy.mockRestore();
    });

    it('routes Google connection tests through the registered Gemini provider', async () => {
        const provider = fakeProvider('gemini', []);
        const service = new AiService([provider]);

        await expect(service.testConnection('google')).resolves.toBeUndefined();
        expect(provider.testConnection).toHaveBeenCalledOnce();
    });

    it('does not query an unconfigured provider', async () => {
        const provider = fakeProvider('openai', [{ id: 'openai/a' } as AiModel]);
        const service = serviceWithConfiguration([provider], []);

        await expect(service.listModels()).resolves.toEqual([
            { id: 'openai', name: 'openai', state: 'unconfigured', models: [] },
        ]);
        expect(provider.listModels).not.toHaveBeenCalled();
    });

    it('keeps a configured provider with an empty successful model list ready', async () => {
        const provider = fakeProvider('anthropic', []);
        const service = serviceWithConfiguration([provider], ['anthropic']);

        await expect(service.listModels()).resolves.toEqual([
            { id: 'anthropic', name: 'anthropic', state: 'ready', models: [] },
        ]);
    });

    it('rejects connection tests for unregistered providers', async () => {
        const service = new AiService([]);

        await expect(service.testConnection('openai')).rejects.toThrow(
            'Unsupported AI provider: openai.',
        );
    });
});

function fakeProvider(id: string, models: AiModel[] | Error): AiProvider {
    return {
        id,
        name: id === 'gemini' ? 'Google Gemini' : id,
        generate: vi.fn(),
        listModels: models instanceof Error
            ? vi.fn().mockRejectedValue(models)
            : vi.fn().mockResolvedValue(models),
        testConnection: vi.fn().mockResolvedValue(undefined),
    };
}

function serviceWithConfiguration(
    providers: AiProvider[],
    configuredProviders: readonly AiProviderId[],
): AiService {
    const configured = new Set(configuredProviders);
    const configuration: AiProviderConfiguration = {
        apiKeys: {
            openrouter: { configured: configured.has('openrouter'), suffix: null },
            google: { configured: configured.has('google'), suffix: null },
            openai: { configured: configured.has('openai'), suffix: null },
            anthropic: { configured: configured.has('anthropic'), suffix: null },
        },
        serverUrls: {
            ollama: configured.has('ollama') ? 'http://localhost:11434' : null,
            'lm-studio': configured.has('lm-studio') ? 'http://localhost:1234' : null,
        },
    };
    return new AiService(providers, { loadConfiguration: vi.fn().mockResolvedValue(configuration) });
}
