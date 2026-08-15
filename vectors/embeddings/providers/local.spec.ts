import { describe, expect, it } from 'vitest';

import { formatLocalEmbeddingText } from '../text-format';

describe('LocalEmbeddingProvider', () => {
    it('uses the mxbai query instruction only for query embeddings', () => {
        const model = 'mixedbread-ai/mxbai-embed-large-v1';
        expect(formatLocalEmbeddingText(model, 'A silver key', 'document')).toBe('A silver key');
        expect(formatLocalEmbeddingText(model, 'A silver key', 'query')).toBe(
            'Represent this sentence for searching relevant passages: A silver key',
        );
    });
});
