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
