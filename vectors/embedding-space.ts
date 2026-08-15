import { createHash } from 'crypto';

import type { EmbeddingSpaceDescriptor } from '../shared/models/vector.model';

/** Produces the stable identifier for an embedding provider and model configuration. */
export function embeddingSpaceId(space: EmbeddingSpaceDescriptor): string {
    return [
        space.provider,
        space.model,
        space.dimensions,
        space.revision,
    ].join(':');
}

/** Derives the isolated vector-table name for an embedding configuration. */
export function tableNameForEmbeddingSpace(space: EmbeddingSpaceDescriptor): string {
    const hash = createHash('sha256')
        .update(embeddingSpaceId(space))
        .digest('hex')
        .slice(0, 20);
    return `manuscript_${hash}`;
}
