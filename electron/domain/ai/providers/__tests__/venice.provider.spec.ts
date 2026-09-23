import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api-key.service', () => ({ apiKeyService: { getApiKey: vi.fn() } }));
vi.mock('../../../../../db/repositories/system-prompt.repository', () => ({
    systemPromptRepository: { getById: vi.fn() },
}));

import { VeniceProvider } from '../venice.provider';
import { streamResponse } from './provider-test-helpers';
import type { AiPromptRequest } from '../../models';
import { systemPromptRepository } from '../../../../../db/repositories/system-prompt.repository';

const request: AiPromptRequest = { model: 'venice', modelId: 'test-model', prompt: 'Write.' };

function model({ reasoning = true, effort = true } = {}) {
    return {
        id: 'test-model', type: 'text',
        model_spec: {
            name: 'Test model',
            capabilities: { supportsReasoning: reasoning, supportsReasoningEffort: effort },
        },
    };
}

function modelResponse(models: unknown[] = [model()]) {
    return Response.json({ data: models });
}

function completion() {
    return streamResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"Thinking", "reasoning":"Ignore"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Draft"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n',
        'data: [DONE]\n\n',
    ]);
}

describe('VeniceProvider', () => {
    const getApiKey = vi.fn();
    const fetchMock = vi.fn();
    const provider = new VeniceProvider({ getApiKey }, fetchMock);

    beforeEach(() => {
        getApiKey.mockReset().mockResolvedValue('venice-secret');
        fetchMock.mockReset();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('preserves messages and settings while streaming prose, reasoning, and usage separately', async () => {
        fetchMock.mockResolvedValue(completion());
        const onToken = vi.fn();
        const onReasoningToken = vi.fn();
        const signal = new AbortController().signal;
        await expect(provider.generate({
            ...request, systemMessage: 'App instructions',
            messages: [{ role: 'user', content: 'First' }, { role: 'assistant', content: 'Second' }],
            temperature: 0.7, maxTokens: 100, abortSignal: signal, onToken, onReasoningToken,
        })).resolves.toEqual({
            text: 'Draft', modelUsed: 'test-model',
            usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.venice.ai/api/v1/chat/completions');
        expect(init?.signal).toBe(signal);
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer venice-secret' });
        expect(JSON.parse(init?.body as string)).toEqual({
            model: 'test-model', stream: true, stream_options: { include_usage: true },
            temperature: 0.7, max_tokens: 100,
            messages: [
                { role: 'system', content: 'App instructions' },
                { role: 'user', content: 'First' }, { role: 'assistant', content: 'Second' },
            ],
            reasoning: { enabled: false },
            venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off' },
        });
        expect(onToken.mock.calls).toEqual([['Draft']]);
        expect(onReasoningToken.mock.calls).toEqual([['Thinking']]);
        expect(getApiKey).toHaveBeenCalledWith('venice');
    });

    it('uses the selected system prompt preset and its generation settings', async () => {
        vi.mocked(systemPromptRepository.getById).mockResolvedValue({
            category: 'chat', systemPrompt: 'Preset instructions', temperature: 0.8,
            topP: 0.9, presencePenalty: 0.1, frequencyPenalty: 0.2, maxOutputTokens: 321,
        } as Awaited<ReturnType<typeof systemPromptRepository.getById>>);
        fetchMock.mockResolvedValue(completion());
        await provider.generate({ ...request, systemPromptPreset: { presetId: 'custom', category: 'chat' } });
        const payload = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
        expect(payload).toMatchObject({
            temperature: 0.8, top_p: 0.9, presence_penalty: 0.1, frequency_penalty: 0.2,
            max_tokens: 321, venice_parameters: { include_venice_system_prompt: false },
        });
        expect(payload.messages[0].content).toContain('Preset instructions');
    });

    it.each(['low', 'medium', 'high', undefined] as const)('sends supported effort %s', async (effort) => {
        fetchMock.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(completion());
        await provider.generate({ ...request, reasoningMode: true, reasoningEffort: effort });
        const payload = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
        expect(payload.reasoning_effort).toBe(effort ?? 'medium');
        expect(payload).not.toHaveProperty('reasoning');
    });

    it('allows native reasoning without sending effort for models without effort control', async () => {
        fetchMock.mockResolvedValueOnce(modelResponse([model({ effort: false })]))
            .mockResolvedValueOnce(completion());
        await provider.generate({ ...request, reasoningMode: true });
        const payload = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
        expect(payload).not.toHaveProperty('reasoning_effort');
        expect(payload).not.toHaveProperty('reasoning');
    });

    it.each([
        { models: [model({ reasoning: false })], effort: undefined, error: 'does not support reasoning' },
        { models: [model({ effort: false })], effort: 'high' as const, error: 'adjustable reasoning effort' },
        { models: [], effort: undefined, error: 'was not found' },
    ])('rejects $error before generation', async ({ models, effort, error }) => {
        fetchMock.mockResolvedValue(modelResponse(models));
        await expect(provider.generate({ ...request, reasoningMode: true, reasoningEffort: effort }))
            .rejects.toThrow(error);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects effort with reasoning disabled', async () => {
        await expect(provider.generate({ ...request, reasoningEffort: 'high' })).rejects.toThrow('reasoning mode');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('lists only text models with separate capabilities and a timeout', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        fetchMock.mockResolvedValue(modelResponse([model({ effort: false }), { type: 'image' }]));
        await expect(provider.listModels()).resolves.toEqual([{
            id: 'venice/test-model', name: 'Test model', provider: 'venice', providerName: 'Venice',
            source: 'direct', supportsReasoning: true, supportsReasoningEffort: false,
        }]);
        expect(fetchMock).toHaveBeenCalledWith('https://api.venice.ai/api/v1/models?type=text', {
            headers: { Authorization: 'Bearer venice-secret' }, signal: expect.any(AbortSignal),
        });
        expect(timeout).toHaveBeenCalledWith(10_000);
    });

    it.each([{}, { data: [{}] }, { data: [{ type: 'text', id: 'x', model_spec: {} }] }])(
        'rejects malformed model responses', async (body) => {
            fetchMock.mockResolvedValue(Response.json(body));
            await expect(provider.listModels()).rejects.toThrow('malformed model list');
        },
    );

    it('rejects malformed JSON', async () => {
        fetchMock.mockResolvedValue(new Response('invalid'));
        await expect(provider.listModels()).rejects.toThrow('malformed JSON');
    });

    it('requires credentials for generation, discovery, and connection testing', async () => {
        getApiKey.mockResolvedValue(null);
        await expect(provider.generate(request)).rejects.toThrow('configured API key');
        await expect(provider.listModels()).rejects.toThrow('configured API key');
        await expect(provider.testConnection()).rejects.toThrow('configured API key');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires an explicit model', async () => {
        await expect(provider.generate({ ...request, modelId: ' ' })).rejects.toThrow('explicitly selected model');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('tests connections without generating text', async () => {
        fetchMock.mockResolvedValue(modelResponse());
        await provider.testConnection();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/models?type=text');
    });

    it.each([401, 402, 429, 500])('preserves HTTP %s errors', async (status) => {
        fetchMock.mockResolvedValue(Response.json({ error: 'Venice detail' }, { status }));
        await expect(provider.testConnection()).rejects.toThrow(`Venice API error (${status}): Venice detail`);
    });

    it('preserves rejected individual effort levels without retrying', async () => {
        fetchMock.mockResolvedValueOnce(modelResponse())
            .mockResolvedValueOnce(Response.json({ error: 'medium is not supported' }, { status: 400 }));
        await expect(provider.generate({ ...request, reasoningMode: true })).rejects.toThrow('medium is not supported');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('preserves stream errors', async () => {
        fetchMock.mockResolvedValue(streamResponse(['data: {"error":"Stream failed"}\n\n']));
        await expect(provider.generate(request)).rejects.toThrow('Stream failed');
    });

    it('cancels the model lookup before starting generation', async () => {
        const controller = new AbortController();
        fetchMock.mockImplementation(async (_url, init) => {
            controller.abort();
            init?.signal?.throwIfAborted();
            return modelResponse();
        });
        await expect(provider.generate({ ...request, reasoningMode: true, abortSignal: controller.signal }))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('propagates cancellation during streaming', async () => {
        const aborted = new DOMException('Aborted', 'AbortError');
        fetchMock.mockResolvedValue(new Response(new ReadableStream({
            start(controller) { controller.error(aborted); },
        })));
        await expect(provider.generate(request)).rejects.toBe(aborted);
    });
});
