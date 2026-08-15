import type {
    EmbeddingSpaceDescriptor,
    ManuscriptVectorRecord,
    SimilarParagraphResult,
} from '../../shared/models/vector.model';
import { escapeLanceSql, vectorDb } from '../lancedb.connection';

export class ParagraphVectorRepository {
    async getExistingParagraphHashes(
        space: EmbeddingSpaceDescriptor,
        paragraphIds: string[],
    ): Promise<Map<string, string>> {
        if (paragraphIds.length === 0) return new Map();

        const table = await vectorDb.getManuscriptTable(space);
        const idsList = paragraphIds
            .map(id => `'${escapeLanceSql(id)}'`)
            .join(', ');
        const records = await table
            .query()
            .where(`id IN (${idsList})`)
            .select(['id', 'hash'])
            .toArray();

        return new Map(records.map(record => [String(record['id']), String(record['hash'])]));
    }

    async getBookParagraphHashes(
        space: EmbeddingSpaceDescriptor,
        bookId: string,
    ): Promise<Map<string, string>> {
        const table = await vectorDb.getManuscriptTable(space);
        const records = await table
            .query()
            .where(`bookId = '${escapeLanceSql(bookId)}'`)
            .select(['id', 'hash'])
            .toArray();

        return new Map(records.map(record => [String(record['id']), String(record['hash'])]));
    }

    async upsertParagraphs(
        space: EmbeddingSpaceDescriptor,
        records: ManuscriptVectorRecord[],
    ): Promise<void> {
        if (records.length === 0) return;

        const table = await vectorDb.getManuscriptTable(space);
        await table
            .mergeInsert('id')
            .whenMatchedUpdateAll()
            .whenNotMatchedInsertAll()
            .execute(records as unknown as Record<string, unknown>[]);
    }

    async deleteParagraphs(
        space: EmbeddingSpaceDescriptor,
        paragraphIds: string[],
    ): Promise<void> {
        if (paragraphIds.length === 0) return;

        const table = await vectorDb.getManuscriptTable(space);
        const idsList = paragraphIds
            .map(id => `'${escapeLanceSql(id)}'`)
            .join(', ');
        await table.delete(`id IN (${idsList})`);
    }

    async searchSimilar(
        space: EmbeddingSpaceDescriptor,
        bookId: string,
        queryVector: number[],
        limit: number,
    ): Promise<SimilarParagraphResult[]> {
        const table = await vectorDb.getManuscriptTable(space);
        const records = await table
            .vectorSearch(queryVector)
            .distanceType('cosine')
            .where(`bookId = '${escapeLanceSql(bookId)}'`)
            .limit(limit)
            .toArray();

        return records.map(record => ({
            paragraphId: String(record['id']),
            actId: String(record['actId']),
            chapterId: String(record['chapterId']),
            sceneId: String(record['sceneId']),
            text: String(record['text']),
            distance: Number(record['_distance']),
        }));
    }
}

export const paragraphVectorRepository = new ParagraphVectorRepository();
