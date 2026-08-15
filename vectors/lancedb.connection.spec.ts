import { describe, expect, it } from 'vitest';

import { embeddingSpaceId, tableNameForEmbeddingSpace } from './embedding-space';

describe('VectorDatabase embedding spaces', () => {
    it('uses separate tables for incompatible provider/model spaces', () => {
        const local = {
            provider: 'local' as const,
            model: 'mixedbread-ai/mxbai-embed-large-v1',
            dimensions: 1024,
            revision: '1',
        };
        const openAI = {
            provider: 'openAI' as const,
            model: 'text-embedding-3-small',
            dimensions: 1536,
            revision: '1',
        };

        expect(embeddingSpaceId(local)).not.toBe(embeddingSpaceId(openAI));
        expect(tableNameForEmbeddingSpace(local)).not.toBe(tableNameForEmbeddingSpace(openAI));
    });
});
