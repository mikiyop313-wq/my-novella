/** Verifies that vector cleanup targets only the requested embedding-space table. */

import { describe, expect, it, vi } from 'vitest';

import { tableNameForEmbeddingSpace } from '../embedding-space';
import { VectorDatabase } from '../lancedb.connection';
import { LOCAL_EMBEDDING_SPACE } from '../embeddings/local-model-definition';

describe('VectorDatabase local embedding cleanup', () => {
    it('drops only the exact local embedding table', async () => {
        const localTable = tableNameForEmbeddingSpace(LOCAL_EMBEDDING_SPACE);
        const cloudTable = tableNameForEmbeddingSpace({
            provider: 'openAI',
            model: 'text-embedding-3-small',
            dimensions: 1536,
            revision: '1',
        });
        const connection = {
            tableNames: vi.fn().mockResolvedValue([localTable, cloudTable]),
            dropTable: vi.fn().mockResolvedValue(undefined),
        };
        const database = Object.create(VectorDatabase.prototype) as VectorDatabase;
        vi.spyOn(database, 'connect').mockResolvedValue(connection as never);

        await database.dropEmbeddingSpace(LOCAL_EMBEDDING_SPACE);

        expect(connection.dropTable).toHaveBeenCalledOnce();
        expect(connection.dropTable).toHaveBeenCalledWith(localTable);
        expect(connection.dropTable).not.toHaveBeenCalledWith(cloudTable);
    });
});
