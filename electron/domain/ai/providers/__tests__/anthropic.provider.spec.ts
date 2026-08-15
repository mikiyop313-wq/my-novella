import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());
vi.mock('../../api-key.service', () => ({
    apiKeyService: { getApiKey: vi.fn() },
}));
vi.mock('../../chat-completion-payload-builder.service', () => ({
    chatCompletionPayloadBuilderService: { buildChatCompletionPayload },
}));

import { AnthropicProvider } from '../anthropic.provider';
import { streamResponse } from './provider-test-helpers';

describe('AnthropicProvider', () => {
    const getApiKey = vi.fn();

    beforeEach(() => {
        getApiKey.mockReset().mockResolvedValue('anthropic-secret');
        buildChatCompletionPayload.mockReset().mockResolvedValue({
            model: 'claude-a',
            messages: [
                { role: 'system', content: 'System one.' },
                { role: 'system', content: 'System two.' },
                { role: 'user', content: 'Write.' },
                { role: 'assistant', content: 'Beginning.' },
            ],
            temperature: 0.7,
            top_p: 0.9,
            presence_penalty: 0.2,
            frequency_penalty: 0.1,
            stream: true,
        });
        vi.stubGlobal('fetch', vi.fn());
    });

    it('translates messages and streams native text, thinking, and usage', async () => {
        vi.mocked(fetch).mockResolvedValue(streamResponse([
            'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":7}}}\n\n',
            'event: ping\ndata: {"type":"ping"}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Consider"}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Answer"}}\n\n',
            'event: future_event\ndata: {"type":"future_event"}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ]));
        const onToken = vi.fn();
        const onReasoningToken = vi.fn();
        const provider = new AnthropicProvider({ getApiKey } as any);

        await expect(provider.generate({
            model: 'anthropic',
            modelId: 'claude-a',
            prompt: 'Write.',
            reasoningMode: true,
            onToken,
            onReasoningToken,
        })).resolves.toEqual({
            text: 'Answer',
            modelUsed: 'claude-a',
            usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
        });

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(init?.headers).toEqual(expect.objectContaining({
            'x-api-key': 'anthropic-secret',
            'anthropic-version': '2023-06-01',
        }));
        const payload = JSON.parse(init?.body as string);
        expect(payload).toEqual({
            model: 'claude-a',
            messages: [
                { role: 'user', content: 'Write.' },
                { role: 'assistant', content: 'Beginning.' },
            ],
            max_tokens: 4096,
            stream: true,
            system: 'System one.\n\nSystem two.',
            thinking: { type: 'adaptive', display: 'summarized' },
        });
        expect(onReasoningToken).toHaveBeenCalledWith('Consider');
        expect(onToken).toHaveBeenCalledWith('Answer');
    });

    it('uses an explicit max token setting and omits thinking when disabled', async () => {
        buildChatCompletionPayload.mockResolvedValueOnce({
            model: 'claude-a',
            messages: [{ role: 'user', content: 'Write.' }],
            temperature: 0.5,
            max_tokens: 900,
            stream: true,
        });
        vi.mocked(fetch).mockResolvedValue(streamResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Done"}}\n\n',
        ]));
        const provider = new AnthropicProvider({ getApiKey } as any);

        await provider.generate({
            model: 'anthropic',
            modelId: 'claude-a',
            prompt: 'Write.',
        });

        const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
        expect(payload.max_tokens).toBe(900);
        expect(payload).not.toHaveProperty('thinking');
        expect(payload).not.toHaveProperty('temperature');
    });

    it('paginates models and marks only adaptive thinking as supported', async () => {
        const timeoutSignal = new AbortController().signal;
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
        vi.mocked(fetch)
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [{
                    id: 'claude-adaptive',
                    display_name: 'Claude Adaptive',
                    capabilities: {
                        thinking: { types: { adaptive: { supported: true } } },
                    },
                }],
                has_more: true,
                last_id: 'claude-adaptive',
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: [{
                    id: 'claude-manual',
                    display_name: 'Claude Manual',
                    capabilities: {
                        thinking: { supported: true, types: { enabled: { supported: true } } },
                    },
                }],
                has_more: false,
                last_id: 'claude-manual',
            }), { status: 200 }));
        const provider = new AnthropicProvider({ getApiKey } as any);

        await expect(provider.listModels()).resolves.toEqual([
            expect.objectContaining({
                id: 'anthropic/claude-adaptive',
                provider: 'anthropic',
                supportsReasoning: true,
            }),
            expect.objectContaining({
                id: 'anthropic/claude-manual',
                supportsReasoning: false,
            }),
        ]);
        expect(vi.mocked(fetch).mock.calls[1][0].toString()).toContain(
            'after_id=claude-adaptive',
        );
        expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({
            'x-api-key': 'anthropic-secret',
            'anthropic-version': '2023-06-01',
        });
        expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(timeoutSignal);
        expect(timeout).toHaveBeenCalledWith(10_000);
        timeout.mockRestore();
    });

    it('rejects native stream errors and malformed events', async () => {
        const provider = new AnthropicProvider({ getApiKey } as any);
        vi.mocked(fetch).mockResolvedValueOnce(streamResponse([
            'event: error\ndata: {"type":"error","error":{"message":"Overloaded"}}\n\n',
        ]));
        await expect(provider.generate({
            model: 'anthropic', modelId: 'claude-a', prompt: 'Write.',
        })).rejects.toThrow('Overloaded');

        vi.mocked(fetch).mockResolvedValueOnce(streamResponse(['data: not-json\n\n']));
        await expect(provider.generate({
            model: 'anthropic', modelId: 'claude-a', prompt: 'Write.',
        })).rejects.toThrow('malformed stream event');
    });

    it('requires credentials and a model, and preserves generation aborts', async () => {
        const provider = new AnthropicProvider({ getApiKey } as any);
        getApiKey.mockResolvedValueOnce(null);
        await expect(provider.generate({
            model: 'anthropic', modelId: 'claude-a', prompt: 'Write.',
        })).rejects.toThrow('API key configured');
        expect(fetch).not.toHaveBeenCalled();

        getApiKey.mockResolvedValueOnce('anthropic-secret');
        await expect(provider.generate({ model: 'anthropic', prompt: 'Write.' }))
            .rejects.toThrow('explicitly selected model');
        expect(fetch).not.toHaveBeenCalled();

        const controller = new AbortController();
        const abortError = new DOMException('Stopped', 'AbortError');
        vi.mocked(fetch).mockRejectedValueOnce(abortError);
        await expect(provider.generate({
            model: 'anthropic', modelId: 'claude-a', prompt: 'Write.', abortSignal: controller.signal,
        })).rejects.toBe(abortError);
        expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBe(controller.signal);
    });

    it('does not list without a key and reports HTTP failures', async () => {
        const provider = new AnthropicProvider({ getApiKey } as any);
        getApiKey.mockResolvedValueOnce(null);
        await expect(provider.listModels()).resolves.toEqual([]);
        expect(fetch).not.toHaveBeenCalled();

        getApiKey.mockResolvedValueOnce('anthropic-secret');
        vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }));
        await expect(provider.listModels()).rejects.toThrow('Anthropic API error (500)');
    });

    it('accepts an authenticated connection with zero models', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
            data: [],
            has_more: false,
        }), { status: 200 }));
        const provider = new AnthropicProvider({ getApiKey } as any);

        await expect(provider.testConnection()).resolves.toBeUndefined();
        expect(fetch).toHaveBeenCalledOnce();
    });
});
