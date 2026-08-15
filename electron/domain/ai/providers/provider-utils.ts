export function requireModelId(modelId: string | undefined, providerName: string): string {
    const resolved = modelId?.trim();
    if (!resolved) {
        throw new Error(`${providerName} generation requires an explicitly selected model.`);
    }
    return resolved;
}

export async function assertSuccessfulResponse(response: Response, providerName: string): Promise<void> {
    if (response.ok) return;

    let providerMessage: string | null = null;
    try {
        const body = asObject(await response.clone().json());
        const error = asObject(body?.['error']);
        providerMessage = typeof error?.['message'] === 'string' ? error['message'] : null;
    } catch {
        // Status information remains sufficient when the response is not JSON.
    }

    throw new Error(
        `${providerName} API error (${response.status})${providerMessage ? `: ${providerMessage}` : '.'}`,
    );
}

export async function parseJsonResponse(response: Response, providerName: string): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        throw new Error(`${providerName} returned malformed JSON.`);
    }
}

export function asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

const NON_TEXT_MODEL_TOKENS = new Set([
    'dall',
    'imagen',
    'moderation',
    'rerank',
    'reranker',
    'seedance',
    'seedream',
    'sora',
    'speech',
    'transcribe',
    'transcription',
    'tts',
    'veo',
    'whisper',
]);

const NON_TEXT_MODEL_FAMILIES = [
    'antigravity',
    'dall-e',
    'deep research',
    'deep-research',
    'gemini-omni',
    'gpt-image',
    'lyra',
    'lyria',
    'nano-banana',
    'qwen-image',
    'robotics',
    'stable-diffusion',
    'z-image',
];

/** Keeps unknown models while excluding model families that do not produce usable text. */
export function isTextGenerationModel(modelId: string, displayName?: string): boolean {
    const identifier = `${modelId} ${displayName ?? ''}`.toLowerCase();
    const tokens = identifier.split(/[^a-z0-9]+/).filter(Boolean);

    if (NON_TEXT_MODEL_FAMILIES.some((family) => identifier.includes(family))) return false;
    if (tokens.some((token) => token.startsWith('embed') || NON_TEXT_MODEL_TOKENS.has(token))) {
        return false;
    }

    // Gemini image models are named like gemini-2.5-flash-image and can also advertise text output.
    return !(tokens.includes('gemini') && tokens.includes('image'));
}
