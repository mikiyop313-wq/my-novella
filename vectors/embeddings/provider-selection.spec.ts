import { describe, expect, it } from 'vitest';

import {
    EmbeddingProviderUnavailableError,
    requireEmbeddingApiKey,
} from './provider-selection';

describe('embedding provider selection', () => {
    it('does not silently substitute local embeddings for an unavailable API provider', () => {
        expect(() => requireEmbeddingApiKey('openAI', undefined))
            .toThrow(EmbeddingProviderUnavailableError);
        expect(() => requireEmbeddingApiKey('voyage', ''))
            .toThrow('selected voyage embedding provider is not configured');
    });

    it('returns the selected API provider credential when configured', () => {
        expect(requireEmbeddingApiKey('openAI', 'configured-key')).toBe('configured-key');
    });
});
