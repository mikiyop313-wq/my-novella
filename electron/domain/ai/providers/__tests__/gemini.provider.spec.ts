import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());
vi.mock('../../api-key.service', () => ({
    apiKeyService: { getApiKey: vi.fn() },
}));
vi.mock('../../chat-completion-payload-builder.service', () => ({
    chatCompletionPayloadBuilderService: { buildChatCompletionPayload },
}));

import { GeminiProvider } from '../gemini.provider';
import { streamResponse } from './provider-test-helpers';

describe('GeminiProvider', () => {
    const getApiKey = vi.fn();

    beforeEach(() => {
        getApiKey.mockReset().mockResolvedValue('gemini-secret');
        buildChatCompletionPayload.mockReset().mockResolvedValue({
            model: 'gemini-a',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.5,
            stream: true,
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('uses Gemini OpenAI compatibility for streamed generation', async () => {
        vi.mocked(fetch).mockResolvedValue(streamResponse([
            'data: {"choices":[{"delta":{"content":"Gemini"}}]}\n\n',
            'data: [DONE]\n\n',
        ]));
        const provider = new GeminiProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'gemini',
            modelId: 'gemini-a',
            prompt: 'Write.',
            reasoningMode: true,
        })).resolves.toMatchObject({ text: 'Gemini', modelUsed: 'gemini-a' });

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        );
        expect(init?.headers).toEqual(expect.objectContaining({
            Authorization: 'Bearer gemini-secret',
        }));
        expect(JSON.parse(init?.body as string)).toMatchObject({
            model: 'gemini-a',
            reasoning_effort: 'medium',
        });
    });

    it('paginates native models, filters generateContent, and maps thinking', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response(JSON.stringify({
                models: [
                    {
                        name: 'models/gemini-thinking',
                        displayName: 'Gemini Thinking',
                        supportedGenerationMethods: ['generateContent'],
                        thinking: true,
                    },
                    {
                        name: 'models/embed',
                        displayName: 'Embed',
                        supportedGenerationMethods: ['embedContent'],
                    },
                    {
                        name: 'models/gemini-2.5-flash-image',
                        displayName: 'Nano Banana',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/lyria-3-pro-preview',
                        displayName: 'Lyria 3 Pro Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/deep-research-pro-preview',
                        displayName: 'Gemini Deep Research Pro Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/gemini-omni-flash-preview',
                        displayName: 'Gemini Omni Flash Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/antigravity-agent-preview',
                        displayName: 'Antigravity Agent Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                    {
                        name: 'models/gemini-robotics-er-1.5-preview',
                        displayName: 'Gemini Robotics-ER 1.5 Preview',
                        supportedGenerationMethods: ['generateContent'],
                    },
                ],
                nextPageToken: 'next-page',
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                models: [{
                    name: 'models/gemini-basic',
                    displayName: 'Gemini Basic',
                    supportedGenerationMethods: ['generateContent'],
                    thinking: false,
                }],
            }), { status: 200 }));
        const provider = new GeminiProvider({ getApiKey } as any);

        await expect(provider.listModels()).resolves.toEqual([
            expect.objectContaining({
                id: 'gemini/gemini-thinking',
                name: 'Gemini Thinking',
                provider: 'google',
                supportsReasoning: true,
            }),
            expect.objectContaining({
                id: 'gemini/gemini-basic',
                supportsReasoning: false,
            }),
        ]);
        const [firstUrl, firstInit] = vi.mocked(fetch).mock.calls[0];
        const [secondUrl] = vi.mocked(fetch).mock.calls[1];
        expect(firstUrl.toString()).toContain('pageSize=1000');
        expect(secondUrl.toString()).toContain('pageToken=next-page');
        expect(firstInit?.headers).toEqual({ 'x-goog-api-key': 'gemini-secret' });
        expect(firstInit?.signal).toBe(timeoutSignal);
        expect(timeout).toHaveBeenCalledWith(10_000);
        expect(firstUrl.toString()).not.toContain('gemini-secret');
        timeout.mockRestore();
    });

    it('rejects malformed model lists', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ models: [{}] }), {
            status: 200,
        }));
        const provider = new GeminiProvider({ getApiKey } as any);
        await expect(provider.listModels()).rejects.toThrow('malformed model list');
    });

    it('accepts an authenticated connection with zero models', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ models: [] }), {
            status: 200,
        }));
        const provider = new GeminiProvider({ getApiKey } as any);

        await expect(provider.testConnection()).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not list without a key and reports HTTP failures', async () => {
        const provider = new GeminiProvider({ getApiKey } as any);
        getApiKey.mockResolvedValueOnce(null);
        await expect(provider.listModels()).resolves.toEqual([]);
        expect(fetch).not.toHaveBeenCalled();

        getApiKey.mockResolvedValueOnce('gemini-secret');
        vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429 }));
        await expect(provider.listModels()).rejects.toThrow(
            'Google Gemini API error (429)',
        );
    });
});
