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

import type { AiModel } from '../../../shared/models/ai.model';
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
        const service = new AiService(providers);

        await expect(service.listModels()).resolves.toEqual([openAiModel, anthropicModel]);
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
        const service = new AiService(providers);

        await expect(service.listModels()).resolves.toEqual([ollamaModel]);
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
