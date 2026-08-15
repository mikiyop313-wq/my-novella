import { describe, expect, it, vi } from 'vitest';

import { streamFromChunks } from './provider-test-helpers';
import { readServerSentEvents } from '../streaming/sse-decoder';

describe('readServerSentEvents', () => {
    it('preserves fragmented CRLF and multiline events plus a trailing event', async () => {
        const handler = vi.fn();
        const body = streamFromChunks([
            'event: update\r\ndata: {"value":',
            '1}\r\ndata: second\r\n\r',
            '\n: ping\ndata: trailing',
        ]);

        await readServerSentEvents(body, handler);

        expect(handler).toHaveBeenNthCalledWith(1, {
            event: 'update',
            data: '{"value":1}\nsecond',
        });
        expect(handler).toHaveBeenNthCalledWith(2, {
            event: null,
            data: 'trailing',
        });
    });

    it('stops reading when the handler returns false', async () => {
        const handler = vi.fn().mockReturnValue(false);
        await readServerSentEvents(streamFromChunks(['data: first\n\ndata: second\n\n']), handler);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty response body', async () => {
        await expect(readServerSentEvents(null, vi.fn())).rejects.toThrow('empty response stream');
    });
});
