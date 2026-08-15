import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildChatCompletionPayload = vi.hoisted(() => vi.fn());

vi.mock('../prompt-builder.service', () => ({
    promptBuilderService: { buildChatCompletionPayload },
}));

import { OpenRouterProvider } from './openrouter.provider';

describe('OpenRouterProvider', () => {
    beforeEach(() => {
        buildChatCompletionPayload.mockReset();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: null }));
    });

    it('awaits the prompt builder and sends the resolved payload', async () => {
        let resolvePayload!: (payload: Record<string, unknown>) => void;
        buildChatCompletionPayload.mockReturnValue(new Promise((resolve) => {
            resolvePayload = resolve;
        }));
        const provider = new OpenRouterProvider();
        const request = { model: 'openrouter' as const, prompt: 'Write.' };
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
            'minimax/minimax-m2.5:free',
        );
        expect(fetch).toHaveBeenCalledWith(
            'https://openrouter.ai/api/v1/chat/completions',
            expect.objectContaining({ body: JSON.stringify(payload) }),
        );
    });
});
