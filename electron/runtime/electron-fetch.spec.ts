import { beforeEach, describe, expect, it, vi } from 'vitest';

const netFetch = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
    net: { fetch: netFetch },
}));

import { electronFetch } from './electron-fetch';

describe('electronFetch', () => {
    beforeEach(() => {
        netFetch.mockReset();
    });

    it('normalizes URL inputs and forwards fetch options to Electron net.fetch', async () => {
        const response = new Response(null, { status: 204 });
        const controller = new AbortController();
        const init: RequestInit = {
            method: 'POST',
            headers: { Authorization: 'Bearer secret' },
            body: '{}',
            signal: controller.signal,
        };
        netFetch.mockResolvedValue(response);

        await expect(electronFetch(new URL('https://openrouter.ai/api/v1/key'), init))
            .resolves.toBe(response);

        expect(netFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/key', init);
    });

    it('preserves string and Request inputs', async () => {
        netFetch.mockResolvedValue(new Response());
        const request = new Request('https://api.openai.com/v1/models');

        await electronFetch('https://api.anthropic.com/v1/models');
        await electronFetch(request);

        expect(netFetch).toHaveBeenNthCalledWith(
            1,
            'https://api.anthropic.com/v1/models',
            undefined,
        );
        expect(netFetch).toHaveBeenNthCalledWith(2, request, undefined);
    });
});
