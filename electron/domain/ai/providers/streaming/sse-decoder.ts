/**
 * Decodes raw Server-Sent Event response bodies for AI provider stream consumers.
 *
 * It preserves incomplete network chunks until a full event is available and supports early
 * termination when a consumer receives its provider-specific completion marker.
 *
 * @packageDocumentation
 */

/** A complete Server-Sent Event extracted from a provider response stream. */
export interface ServerSentEvent {
    event: string | null;
    data: string;
}

/** Handles one decoded event; returning `false` stops and cancels further stream reading. */
type EventHandler = (event: ServerSentEvent) => boolean | void | Promise<boolean | void>;

/**
 * Reads a byte stream as Server-Sent Events while preserving events split across network chunks.
 *
 * @param body - The HTTP response body to decode.
 * @param onEvent - Invoked for each complete SSE event.
 * @throws {Error} If the provider response has no stream body.
 */
export async function readServerSentEvents(
    body: ReadableStream<Uint8Array> | null,
    onEvent: EventHandler,
): Promise<void> {
    if (!body) {
        throw new Error('Provider returned an empty response stream.');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });

            let boundary = findEventBoundary(buffer);
            while (boundary) {
                const block = buffer.slice(0, boundary.index);
                buffer = buffer.slice(boundary.index + boundary.length);

                const event = parseEventBlock(block);
                if (event && await onEvent(event) === false) {
                    await reader.cancel();
                    return;
                }

                boundary = findEventBoundary(buffer);
            }

            if (done) break;
        }

        const trailingEvent = parseEventBlock(buffer);
        if (trailingEvent) {
            await onEvent(trailingEvent);
        }
    } finally {
        reader.releaseLock();
    }
}

/** Finds the next valid SSE event delimiter in the buffered text. */
function findEventBoundary(buffer: string): { index: number; length: number } | null {
    const match = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
    return match ? { index: match.index, length: match[0].length } : null;
}

/** Converts one SSE block into an event, ignoring empty blocks and comment-only blocks. */
function parseEventBlock(block: string): ServerSentEvent | null {
    if (!block.trim()) return null;

    let event: string | null = null;
    const data: string[] = [];

    for (const line of block.split(/\r\n|\r|\n/)) {
        if (!line || line.startsWith(':')) continue;

        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) value = value.slice(1);

        if (field === 'event') event = value;
        if (field === 'data') data.push(value);
    }

    return data.length > 0 ? { event, data: data.join('\n') } : null;
}
