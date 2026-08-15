/**
 * Handles Anthropic's streaming Messages API response format.
 *
 * It decodes provider events, exposes visible and reasoning text as it arrives, and normalizes
 * Anthropic token usage into the application's shared AI response shape.
 *
 * @packageDocumentation
 */

import type { AiPromptResponse } from '../../models';
import { asObject } from '../provider-utils';
import { readServerSentEvents } from './sse-decoder';

type StreamCallbacks = {
    onToken?: (token: string) => void;
    onReasoningToken?: (token: string) => void;
};

/** Tracks the token counts delivered across Anthropic's separate lifecycle events. */
interface AnthropicUsage {
    inputTokens: number | null;
    outputTokens: number | null;
}

/**
 * Consumes an Anthropic Messages API SSE response and converts it to the shared AI response shape.
 *
 * Text deltas are accumulated into the final response and forwarded to `onToken`; thinking deltas
 * are forwarded only to `onReasoningToken`. Input and output usage arrive in separate events and
 * are combined when both are available.
 *
 * @param body - The response body returned by Anthropic.
 * @param callbacks - Receives visible-text and reasoning fragments as they arrive.
 * @returns The completed visible text and, when supplied, normalized token usage.
 * @throws {Error} If Anthropic reports an error, returns malformed events, or sends partial usage.
 */
export async function consumeAnthropicStream(
    body: ReadableStream<Uint8Array> | null,
    callbacks: StreamCallbacks,
): Promise<Pick<AiPromptResponse, 'text' | 'usage'>> {
    let text = '';
    const usage: AnthropicUsage = { inputTokens: null, outputTokens: null };

    await readServerSentEvents(body, ({ data }) => {
        const event = parseAnthropicEvent(data);
        const type = event['type'];

        if (type === 'error') {
            const error = asObject(event['error']);
            const message = typeof error?.['message'] === 'string'
                ? error['message']
                : 'Anthropic reported a stream error.';
            throw new Error(message);
        }

        if (type === 'message_start') {
            const message = asObject(event['message']);
            const startUsage = asObject(message?.['usage']);
            const inputTokens = startUsage?.['input_tokens'];
            if (inputTokens !== undefined) {
                if (typeof inputTokens !== 'number') throw malformedAnthropicStream();
                usage.inputTokens = inputTokens;
            }
            return;
        }

        if (type === 'message_delta') {
            const deltaUsage = asObject(event['usage']);
            const outputTokens = deltaUsage?.['output_tokens'];
            if (outputTokens !== undefined) {
                if (typeof outputTokens !== 'number') throw malformedAnthropicStream();
                usage.outputTokens = outputTokens;
            }
            return;
        }

        if (type !== 'content_block_delta') return;

        const delta = asObject(event['delta']);
        if (!delta || typeof delta['type'] !== 'string') throw malformedAnthropicStream();

        if (delta['type'] === 'text_delta') {
            if (typeof delta['text'] !== 'string') throw malformedAnthropicStream();
            text += delta['text'];
            if (delta['text']) callbacks.onToken?.(delta['text']);
        } else if (delta['type'] === 'thinking_delta') {
            if (typeof delta['thinking'] !== 'string') throw malformedAnthropicStream();
            if (delta['thinking']) callbacks.onReasoningToken?.(delta['thinking']);
        }
    });

    const hasUsage = usage.inputTokens !== null || usage.outputTokens !== null;
    if (hasUsage && (usage.inputTokens === null || usage.outputTokens === null)) {
        throw new Error('Anthropic returned incomplete usage data.');
    }

    return {
        text,
        ...(hasUsage ? {
            usage: {
                promptTokens: usage.inputTokens!,
                completionTokens: usage.outputTokens!,
                totalTokens: usage.inputTokens! + usage.outputTokens!,
            },
        } : {}),
    };
}

/** Parses and validates the minimum structure required for an Anthropic SSE event. */
function parseAnthropicEvent(value: string): Record<string, unknown> {
    try {
        const event = asObject(JSON.parse(value));
        if (!event || typeof event['type'] !== 'string') throw new Error();
        return event;
    } catch {
        throw malformedAnthropicStream();
    }
}

/** Creates the consistent error used when an Anthropic event cannot be interpreted safely. */
function malformedAnthropicStream(): Error {
    return new Error('Anthropic returned a malformed stream event.');
}
