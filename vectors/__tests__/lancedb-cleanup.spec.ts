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

    it('deletes one book from every manuscript table and preserves unrelated tables', async () => {
        const legacyTable = { delete: vi.fn().mockResolvedValue(undefined) };
        const localTable = { delete: vi.fn().mockResolvedValue(undefined) };
        const cloudTable = { delete: vi.fn().mockResolvedValue(undefined) };
        const unrelatedTable = { delete: vi.fn().mockResolvedValue(undefined) };
        const tables = new Map([
            ['manuscript', legacyTable],
            ['manuscript_local', localTable],
            ['manuscript_cloud', cloudTable],
            ['other_vectors', unrelatedTable],
        ]);
        const connection = {
            tableNames: vi.fn().mockResolvedValue([...tables.keys()]),
            openTable: vi.fn(async (tableName: string) => tables.get(tableName)),
        };
        const database = Object.create(VectorDatabase.prototype) as VectorDatabase;
        vi.spyOn(database, 'connect').mockResolvedValue(connection as never);

        await database.deleteBookVectors("book-'1");

        expect(connection.openTable).toHaveBeenCalledTimes(3);
        expect(connection.openTable).not.toHaveBeenCalledWith('other_vectors');
        for (const table of [legacyTable, localTable, cloudTable]) {
            expect(table.delete).toHaveBeenCalledWith("bookId = 'book-''1'");
        }
        expect(unrelatedTable.delete).not.toHaveBeenCalled();
    });
});
