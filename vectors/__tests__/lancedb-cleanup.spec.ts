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

    it('clears only the requested book and model across matching revisions', async () => {
        const targetOne = tableWithRecords([{
            provider: 'local', model: 'BAAI/bge-m3', bookId: "book-'1",
        }]);
        const targetTwo = tableWithRecords([{
            provider: 'local', model: 'BAAI/bge-m3', bookId: "book-'1",
        }]);
        const otherModel = tableWithRecords([{
            provider: 'local', model: 'BAAI/bge-small-en-v1.5', bookId: "book-'1",
        }]);
        const otherBook = tableWithRecords([]);
        const tables = new Map([
            ['manuscript_target_v1', targetOne],
            ['manuscript_target_v2', targetTwo],
            ['manuscript_other_model', otherModel],
            ['manuscript_other_book', otherBook],
        ]);
        const connection = {
            tableNames: vi.fn().mockResolvedValue([...tables.keys(), 'unrelated']),
            openTable: vi.fn(async (tableName: string) => tables.get(tableName)),
        };
        const database = Object.create(VectorDatabase.prototype) as VectorDatabase;
        vi.spyOn(database, 'connect').mockResolvedValue(connection as never);

        await database.clearBookIndex("book-'1", 'local', 'BAAI/bge-m3');

        expect(targetOne.delete).toHaveBeenCalledWith("bookId = 'book-''1'");
        expect(targetTwo.delete).toHaveBeenCalledWith("bookId = 'book-''1'");
        expect(otherModel.delete).not.toHaveBeenCalled();
        expect(otherBook.delete).not.toHaveBeenCalled();
        expect(connection.openTable).not.toHaveBeenCalledWith('unrelated');
    });
});

function tableWithRecords(records: Record<string, unknown>[]) {
    return {
        query: vi.fn(() => ({
            where: vi.fn(() => ({
                toArray: vi.fn().mockResolvedValue(records),
            })),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}
