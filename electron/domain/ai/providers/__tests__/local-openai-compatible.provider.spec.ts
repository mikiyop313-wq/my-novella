import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());
vi.mock('../../ai-configuration.service', () => ({
    aiConfigurationService: { getServerUrl: vi.fn() },
}));
vi.mock('../../chat-completion-payload-builder.service', () => ({
    chatCompletionPayloadBuilderService: { buildChatCompletionPayload },
}));

import { LmStudioProvider } from '../lm-studio.provider';
import { OllamaProvider } from '../ollama.provider';
import { streamResponse } from './provider-test-helpers';

describe('local OpenAI-compatible providers', () => {
    const getServerUrl = vi.fn();

    beforeEach(() => {
        getServerUrl.mockReset();
        buildChatCompletionPayload.mockReset().mockResolvedValue({
            model: 'local-model',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.5,
            stream: true,
            reasoning: { enabled: true, effort: 'medium' },
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('streams Ollama generation without authentication or reasoning fields', async () => {
        getServerUrl.mockResolvedValue('http://localhost:11434/');
        vi.mocked(fetch).mockResolvedValue(streamResponse([
            'data: {"choices":[{"delta":{"content":"Local"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}\n\n',
            'data: [DONE]\n\n',
        ]));
        const controller = new AbortController();
        const onToken = vi.fn();
        const provider = new OllamaProvider({ getServerUrl } as any);

        await expect(provider.generate({
            model: 'ollama',
            modelId: 'owner/model',
            prompt: 'Write.',
            reasoningMode: true,
            abortSignal: controller.signal,
            onToken,
        })).resolves.toEqual({
            text: 'Local',
            modelUsed: 'owner/model',
            usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
        });

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe('http://localhost:11434/v1/chat/completions');
        expect(init?.signal).toBe(controller.signal);
        expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
        const payload = JSON.parse(init?.body as string);
        expect(payload).toMatchObject({
            model: 'local-model',
            stream_options: { include_usage: true },
        });
        expect(payload).not.toHaveProperty('reasoning');
        expect(payload).not.toHaveProperty('reasoning_effort');
        expect(onToken).toHaveBeenCalledWith('Local');
    });

    it('uses the configured LM Studio v1 base URL for generation', async () => {
        getServerUrl.mockResolvedValue('http://localhost:1234/v1/');
        vi.mocked(fetch).mockResolvedValue(streamResponse(['data: [DONE]\n\n']));
        const provider = new LmStudioProvider({ getServerUrl } as any);

        await provider.generate({
            model: 'lm-studio', modelId: 'publisher/model', prompt: 'Write.',
        });

        expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
            'http://localhost:1234/v1/chat/completions',
        );
    });

    it('lists local models with complete raw IDs and local metadata', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        getServerUrl.mockImplementation(async (providerId: string) => providerId === 'ollama'
            ? 'http://localhost:11434'
            : 'http://localhost:1234/v1/');
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [
                    { id: 'llama3.2' },
                    { id: 'owner/model' },
                    { id: 'x/z-image-turbo' },
                    { id: 'nomic-embed-text' },
                ],
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [
                    { id: 'publisher/family/model' },
                    { id: 'publisher/seedance-1.5-pro' },
                ],
            }), { status: 200 }));

        const ollama = new OllamaProvider({ getServerUrl } as any);
        const lmStudio = new LmStudioProvider({ getServerUrl } as any);

        await expect(ollama.listModels()).resolves.toEqual([
            {
                id: 'ollama/llama3.2',
                name: 'llama3.2',
                provider: 'ollama',
                providerName: 'Ollama (Local)',
                source: 'local',
                supportsReasoning: false,
            },
            expect.objectContaining({ id: 'ollama/owner/model', name: 'owner/model' }),
        ]);
        await expect(lmStudio.listModels()).resolves.toEqual([
            {
                id: 'lm-studio/publisher/family/model',
                name: 'publisher/family/model',
                provider: 'lm-studio',
                providerName: 'LM Studio (Local)',
                source: 'local',
                supportsReasoning: false,
            },
        ]);

        expect(vi.mocked(fetch).mock.calls[0]).toEqual([
            'http://localhost:11434/v1/models',
            { signal: timeoutSignal },
        ]);
        expect(vi.mocked(fetch).mock.calls[1]).toEqual([
            'http://localhost:1234/v1/models',
            { signal: timeoutSignal },
        ]);
        expect(timeout).toHaveBeenCalledTimes(2);
        expect(timeout).toHaveBeenCalledWith(10_000);
        timeout.mockRestore();
    });

    it('does not list or generate without the required local configuration', async () => {
        getServerUrl.mockResolvedValue(null);
        const provider = new OllamaProvider({ getServerUrl } as any);

        await expect(provider.listModels()).resolves.toEqual([]);
        await expect(provider.generate({
            model: 'ollama', modelId: 'llama3.2', prompt: 'Write.',
        })).rejects.toThrow('server URL configured in Settings');
        await expect(provider.testConnection()).rejects.toThrow(
            'connection test requires a server URL configured in Settings',
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requires an explicit model before requesting generation', async () => {
        getServerUrl.mockResolvedValue('http://localhost:11434');
        const provider = new OllamaProvider({ getServerUrl } as any);

        await expect(provider.generate({ model: 'ollama', prompt: 'Write.' }))
            .rejects.toThrow('explicitly selected model');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects malformed model lists and reports safe HTTP errors', async () => {
        getServerUrl.mockResolvedValue('http://localhost:1234/v1');
        const provider = new LmStudioProvider({ getServerUrl } as any);

        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{}] }), {
            status: 200,
        }));
        await expect(provider.listModels()).rejects.toThrow('malformed model list');

        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            error: { message: 'Server unavailable.' },
        }), { status: 503 }));
        await expect(provider.generate({
            model: 'lm-studio', modelId: 'model', prompt: 'Write.',
        })).rejects.toThrow('LM Studio API error (503): Server unavailable.');
    });

    it('preserves generation abort errors', async () => {
        getServerUrl.mockResolvedValue('http://localhost:11434');
        const abortError = new DOMException('Stopped', 'AbortError');
        vi.mocked(fetch).mockRejectedValueOnce(abortError);
        const provider = new OllamaProvider({ getServerUrl } as any);

        await expect(provider.generate({
            model: 'ollama', modelId: 'model', prompt: 'Write.',
        })).rejects.toBe(abortError);
    });

    it('accepts local connections with zero models on each provider endpoint', async () => {
        getServerUrl.mockImplementation(async (providerId: string) => providerId === 'ollama'
            ? 'http://localhost:11434'
            : 'http://localhost:1234/v1');
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

        await expect(new OllamaProvider({ getServerUrl } as any).testConnection())
            .resolves.toBeUndefined();
        await expect(new LmStudioProvider({ getServerUrl } as any).testConnection())
            .resolves.toBeUndefined();
        expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
            'http://localhost:11434/v1/models',
            'http://localhost:1234/v1/models',
        ]);
    });
});
