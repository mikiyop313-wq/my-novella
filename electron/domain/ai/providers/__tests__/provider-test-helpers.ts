export function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        },
    });
}

export function streamResponse(chunks: string[]): Response {
    return new Response(streamFromChunks(chunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
    });
}
