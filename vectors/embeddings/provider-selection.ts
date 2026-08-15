import type { EmbeddingModel } from '../../shared/models/vector.model';

/** Indicates that the user-selected remote embedding provider is unavailable. */
export class EmbeddingProviderUnavailableError extends Error {
    /** Creates an error that identifies the remote provider missing its required credentials. */
    constructor(model: EmbeddingModel) {
        super(`The selected ${model} embedding provider is not configured.`);
        this.name = 'EmbeddingProviderUnavailableError';
    }
}

/** Returns a configured remote-provider API key or reports that the selected provider is unavailable. */
export function requireEmbeddingApiKey(
    model: Exclude<EmbeddingModel, 'local'>,
    apiKey: string | undefined,
): string {
    if (!apiKey) throw new EmbeddingProviderUnavailableError(model);
    return apiKey;
}
