import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());

vi.mock('../../api-key.service', () => ({
    apiKeyService: { getApiKey: vi.fn() },
}));
vi.mock('../../prompt-builder.service', () => ({
    promptBuilderService: { buildChatCompletionPayload },
}));

import { OpenRouterProvider } from '../openrouter.provider';
import { streamResponse } from './provider-test-helpers';

describe('OpenRouterProvider', () => {
    const getApiKey = vi.fn();

    beforeEach(() => {
        buildChatCompletionPayload.mockReset();
        getApiKey.mockReset().mockResolvedValue('saved-openrouter-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
            'data: [DONE]\n\n',
        ])));
    });

    it('uses the shared parser for fragmented text and reasoning', async () => {
        buildChatCompletionPayload.mockResolvedValue({
            model: 'model-1',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.8,
            stream: true,
        });
        vi.mocked(fetch).mockResolvedValueOnce(streamResponse([
            'data: {"choices":[{"delta":{"content":"Hel',
            'lo","reasoning":"Think"}}]}\n\ndata: [DONE]\n\n',
        ]));
        const onToken = vi.fn();
        const onReasoningToken = vi.fn();
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'openrouter', modelId: 'model-1', prompt: 'Write.', onToken, onReasoningToken,
        })).resolves.toMatchObject({ text: 'Hello', modelUsed: 'model-1' });
        expect(onToken).toHaveBeenCalledWith('Hello');
        expect(onReasoningToken).toHaveBeenCalledWith('Think');
    });

    it('awaits the prompt builder and sends the resolved payload', async () => {
        let resolvePayload!: (payload: Record<string, unknown>) => void;
        buildChatCompletionPayload.mockReturnValue(new Promise((resolve) => {
            resolvePayload = resolve;
        }));
        const provider = new OpenRouterProvider({ getApiKey } as any);
        const request = { model: 'openrouter' as const, modelId: 'selected/model', prompt: 'Write.' };
        const generation = provider.generate(request);

        expect(fetch).not.toHaveBeenCalled();

        const payload = {
            model: 'model-1',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.8,
            top_p: 0.7,
            presence_penalty: 0.2,
            frequency_penalty: -0.1,
            stream: true,
        };
        resolvePayload(payload);

        await expect(generation).resolves.toMatchObject({ modelUsed: 'model-1' });
        expect(buildChatCompletionPayload).toHaveBeenCalledWith(
            request,
            'selected/model',
        );
        expect(fetch).toHaveBeenCalledWith(
            'https://openrouter.ai/api/v1/chat/completions',
            expect.objectContaining({
                body: JSON.stringify(payload),
                headers: expect.objectContaining({
                    Authorization: 'Bearer saved-openrouter-key',
                }),
            }),
        );
    });

    it('reports generation HTTP failures with the provider error message', async () => {
        buildChatCompletionPayload.mockResolvedValue({
            model: 'model-1',
            messages: [{ role: 'user', content: 'Write.' }],
            stream: true,
        });
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            error: { message: 'Rate limit reached.' },
        }), { status: 429 }));
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'openrouter', modelId: 'model-1', prompt: 'Write.',
        })).rejects.toThrow('OpenRouter API error (429): Rate limit reached.');
    });

    it('requires the model selected in the catalog for generation', async () => {
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'openrouter', prompt: 'Write.',
        })).rejects.toThrow('explicitly selected model');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('does not list models without a saved key', async () => {
        getApiKey.mockResolvedValue(null);
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.listModels()).resolves.toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('lists authenticated text models with timeout and catalog mapping', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            data: [{
                id: 'anthropic/claude-a',
                name: 'Anthropic: Claude A',
                architecture: { output_modalities: ['text'] },
                supported_parameters: ['reasoning'],
            }],
        }), { status: 200 }));
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.listModels()).resolves.toEqual([{
            id: 'anthropic/claude-a',
            name: 'Claude A',
            provider: 'anthropic',
            providerName: 'OpenRouter: Anthropic',
            source: 'openrouter',
            supportsReasoning: true,
        }]);
        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url.toString()).toContain('output_modalities=text');
        expect(init?.headers).toEqual({ Authorization: 'Bearer saved-openrouter-key' });
        expect(init?.signal).toBe(timeoutSignal);
        expect(timeout).toHaveBeenCalledWith(10_000);
        timeout.mockRestore();
    });

    it('tests the saved key through the authenticated current-key endpoint', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            data: { label: 'My Novella' },
        }), { status: 200 }));
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.testConnection()).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', {
            signal: timeoutSignal,
            headers: { Authorization: 'Bearer saved-openrouter-key' },
        });
        expect(timeout).toHaveBeenCalledWith(10_000);
        timeout.mockRestore();
    });

    it('rejects a connection test without a saved key', async () => {
        getApiKey.mockResolvedValue(null);
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.testConnection()).rejects.toThrow(
            'connection test requires an API key configured in Settings',
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects a malformed current-key response', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: null }), {
            status: 200,
        }));
        const provider = new OpenRouterProvider({ getApiKey } as any);

        await expect(provider.testConnection()).rejects.toThrow(
            'malformed connection response',
        );
    });
});
