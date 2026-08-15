import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());
vi.mock('../../api-key.service', () => ({
    apiKeyService: { getApiKey: vi.fn() },
}));
vi.mock('../../prompt-builder.service', () => ({
    promptBuilderService: { buildChatCompletionPayload },
}));

import { OpenAiProvider } from '../openai.provider';
import { streamResponse } from './provider-test-helpers';

describe('OpenAiProvider', () => {
    const getApiKey = vi.fn();

    beforeEach(() => {
        getApiKey.mockReset().mockResolvedValue('openai-secret');
        buildChatCompletionPayload.mockReset().mockResolvedValue({
            model: 'gpt-model',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.5,
            stream: true,
            reasoning: { enabled: true, effort: 'medium' },
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('streams generation with the saved key, exact model, reasoning, and usage', async () => {
        vi.mocked(fetch).mockResolvedValue(streamResponse([
            'data: {"choices":[{"delta":{"content":"Draft"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n',
            'data: [DONE]\n\n',
        ]));
        const onToken = vi.fn();
        const provider = new OpenAiProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'openai',
            modelId: 'gpt-model',
            prompt: 'Write.',
            reasoningMode: true,
            onToken,
        })).resolves.toEqual({
            text: 'Draft',
            modelUsed: 'gpt-model',
            usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        });

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe('https://api.openai.com/v1/chat/completions');
        expect(init?.headers).toEqual(expect.objectContaining({
            Authorization: 'Bearer openai-secret',
        }));
        expect(JSON.parse(init?.body as string)).toMatchObject({
            model: 'gpt-model',
            reasoning_effort: 'medium',
            stream_options: { include_usage: true },
        });
        expect(JSON.parse(init?.body as string)).not.toHaveProperty('reasoning');
        expect(onToken).toHaveBeenCalledWith('Draft');
    });

    it('requires a configured key and explicit model without making a request', async () => {
        const provider = new OpenAiProvider({ getApiKey } as any);
        getApiKey.mockResolvedValueOnce(null);
        await expect(provider.generate({ model: 'openai', modelId: 'gpt', prompt: 'Write.' }))
            .rejects.toThrow('API key configured');

        getApiKey.mockResolvedValueOnce('key');
        await expect(provider.generate({ model: 'openai', prompt: 'Write.' }))
            .rejects.toThrow('explicitly selected model');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('lists every authenticated model with direct selector metadata', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
            data: [{ id: 'gpt-a' }, { id: 'embedding-a' }],
        }), { status: 200 }));
        const provider = new OpenAiProvider({ getApiKey } as any);

        await expect(provider.listModels()).resolves.toEqual([
            {
                id: 'openai/gpt-a',
                name: 'gpt-a',
                provider: 'openai',
                providerName: 'OpenAI (Direct)',
                source: 'direct',
                supportsReasoning: false,
            },
            expect.objectContaining({ id: 'openai/embedding-a' }),
        ]);
        expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({
            Authorization: 'Bearer openai-secret',
        });
        expect(timeout).toHaveBeenCalledWith(10_000);
        expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(timeoutSignal);
        timeout.mockRestore();
    });

    it('does not list models without a saved key', async () => {
        getApiKey.mockResolvedValue(null);
        const provider = new OpenAiProvider({ getApiKey } as any);
        await expect(provider.listModels()).resolves.toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('reports safe HTTP failures and preserves generation aborts', async () => {
        const provider = new OpenAiProvider({ getApiKey } as any);
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            error: { message: 'Access denied.' },
        }), { status: 401 }));
        await expect(provider.listModels()).rejects.toThrow(
            'OpenAI API error (401): Access denied.',
        );

        const controller = new AbortController();
        const abortError = new DOMException('Stopped', 'AbortError');
        vi.mocked(fetch).mockRejectedValueOnce(abortError);
        await expect(provider.generate({
            model: 'openai', modelId: 'gpt-model', prompt: 'Write.', abortSignal: controller.signal,
        })).rejects.toBe(abortError);
        expect(vi.mocked(fetch).mock.calls[1][1]?.signal).toBe(controller.signal);
    });
});
