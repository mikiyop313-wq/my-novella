import { describe, expect, it, vi } from 'vitest';

import { streamFromChunks } from './provider-test-helpers';
import { consumeOpenAiCompatibleStream } from '../streaming/openai-compatible-stream';

describe('consumeOpenAiCompatibleStream', () => {
    it('emits fragmented text and reasoning and returns final usage', async () => {
        const onToken = vi.fn();
        const onReasoningToken = vi.fn();
        const result = await consumeOpenAiCompatibleStream(streamFromChunks([
            'data: {"choices":[{"delta":{"content":"Hel',
            'lo","reasoning":"Think"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\r\n\r\n',
            'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
            'data: [DONE]\n\n',
        ]), { onToken, onReasoningToken });

        expect(result).toEqual({
            text: 'Hello!',
            usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
        });
        expect(onToken.mock.calls.flat()).toEqual(['Hello', '!']);
        expect(onReasoningToken).toHaveBeenCalledWith('Think');
    });

    it('rejects malformed JSON and malformed usage', async () => {
        await expect(consumeOpenAiCompatibleStream(
            streamFromChunks(['data: not-json\n\n']),
            {},
        )).rejects.toThrow('malformed stream event');

        await expect(consumeOpenAiCompatibleStream(
            streamFromChunks(['data: {"choices":[],"usage":{"prompt_tokens":1}}\n\n']),
            {},
        )).rejects.toThrow('malformed usage');
    });
});
