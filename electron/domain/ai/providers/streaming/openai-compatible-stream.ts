/**
 * Handles streaming chat-completion responses from OpenAI-compatible providers.
 *
 * It converts provider SSE chunks into the shared AI response shape and prepares streaming
 * request payloads with usage reporting and optional reasoning enabled.
 *
 * @packageDocumentation
 */

import type { AiChatCompletionPayload, AiPromptResponse } from '../../models';
import { readServerSentEvents } from './sse-decoder';

type StreamCallbacks = {
    onToken?: (token: string) => void;
    onReasoningToken?: (token: string) => void;
};

/**
 * Consumes an OpenAI chat-completions-compatible SSE response.
 *
 * Visible content is accumulated and emitted through `onToken`; reasoning is emitted separately
 * through `onReasoningToken`. Reading stops when the provider sends the `[DONE]` marker.
 *
 * @param body - The provider response body.
 * @param callbacks - Receives visible-text and reasoning fragments as they arrive.
 * @returns The completed visible text and optional normalized token usage.
 * @throws {Error} If the provider reports an error or sends malformed event or usage data.
 */
export async function consumeOpenAiCompatibleStream(
    body: ReadableStream<Uint8Array> | null,
    callbacks: StreamCallbacks,
): Promise<Pick<AiPromptResponse, 'text' | 'usage'>> {
    let text = '';
    let usage: AiPromptResponse['usage'];

    await readServerSentEvents(body, ({ data }) => {
        if (data === '[DONE]') return false;

        const chunk = parseJsonObject(data, 'AI provider returned a malformed stream event.');
        if (chunk['error']) {
            const error = asObject(chunk['error']);
            const message = typeof error?.['message'] === 'string'
                ? error['message']
                : 'The provider reported a stream error.';
            throw new Error(message);
        }

        const rawUsage = chunk['usage'];
        if (rawUsage !== undefined && rawUsage !== null) {
            usage = parseUsage(rawUsage);
        }

        const choices = chunk['choices'];
        if (!Array.isArray(choices)) {
            if (rawUsage !== undefined) return true;
            throw new Error('AI provider returned a malformed stream event.');
        }

        for (const rawChoice of choices) {
            const choice = asObject(rawChoice);
            const delta = asObject(choice?.['delta']);
            emitDelta(delta?.['content'], callbacks.onToken, (token) => {
                text += token;
            });
            emitDelta(delta?.['reasoning'], callbacks.onReasoningToken);
        }

        return true;
    });

    return { text, ...(usage ? { usage } : {}) };
}

/**
 * Adapts the shared chat-completion payload for providers that implement the OpenAI API shape.
 *
 * @param payload - The shared request payload.
 * @param reasoningMode - Whether to request the provider's medium reasoning effort.
 * @returns A payload with streaming usage enabled and OpenRouter-only options removed.
 */
export function openAiCompatiblePayload(
    payload: AiChatCompletionPayload,
    reasoningMode: boolean,
): AiChatCompletionPayload {
    const { reasoning: _openRouterReasoning, ...compatiblePayload } = payload;
    return {
        ...compatiblePayload,
        stream_options: { include_usage: true },
        ...(reasoningMode ? { reasoning_effort: 'medium' as const } : {}),
    };
}

/** Emits one string delta and optionally adds it to the accumulated visible response text. */
function emitDelta(
    value: unknown,
    callback: ((token: string) => void) | undefined,
    collect?: (token: string) => void,
): void {
    if (value === null || value === undefined) return;
    if (typeof value !== 'string') {
        throw new Error('AI provider returned a malformed stream event.');
    }

    collect?.(value);
    if (value) callback?.(value);
}

/** Parses provider token counts into the application's shared usage format. */
function parseUsage(value: unknown): NonNullable<AiPromptResponse['usage']> {
    const usage = asObject(value);
    const promptTokens = usage?.['prompt_tokens'];
    const completionTokens = usage?.['completion_tokens'];
    const totalTokens = usage?.['total_tokens'];

    if (
        typeof promptTokens !== 'number'
        || typeof completionTokens !== 'number'
        || typeof totalTokens !== 'number'
    ) {
        throw new Error('AI provider returned malformed usage data.');
    }

    return { promptTokens, completionTokens, totalTokens };
}

/** Parses a JSON SSE payload and ensures that it is an object. */
function parseJsonObject(value: string, message: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value);
        const object = asObject(parsed);
        if (!object) throw new Error();
        return object;
    } catch {
        throw new Error(message);
    }
}

/** Narrows an unknown value to a non-array object. */
function asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
