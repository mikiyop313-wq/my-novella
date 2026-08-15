import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAIEmbeddingProvider } from '../openai';
import { VoyageEmbeddingProvider } from '../voyage';

describe('cloud embedding provider requests', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('creates an OpenAI query embedding with the configured credential', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ index: 0, embedding: [1, 2, 3] }] }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const provider = new OpenAIEmbeddingProvider({
            type: 'openai', modelName: 'model', dimensions: 3, apiKey: 'openai-key',
        });

        await expect(provider.embedQuery('test')).resolves.toEqual([1, 2, 3]);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.openai.com/v1/embeddings',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'Bearer openai-key' }),
            }),
        );
    });

    it('creates a Voyage query embedding with query input type', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ embedding: [1, 2] }] }),
        });
        vi.stubGlobal('fetch', fetchMock);
        const provider = new VoyageEmbeddingProvider({
            type: 'voyage', modelName: 'model', dimensions: 2, apiKey: 'voyage-key',
        });

        await expect(provider.embedQuery('test')).resolves.toEqual([1, 2]);
        const request = fetchMock.mock.calls[0][1];
        expect(request.headers.Authorization).toBe('Bearer voyage-key');
        expect(JSON.parse(request.body).input_type).toBe('query');
    });
});
