import type {
    EmbeddingSpaceDescriptor,
    ManuscriptVectorRecord,
    SimilarParagraphResult,
} from '../../shared/models/vector.model';
import { escapeLanceSql, vectorDb } from '../lancedb.connection';

export interface BookParagraphVectorState {
    id: string;
    hash: string;
    actId: string;
    chapterId: string;
    sceneId: string;
    position: number;
}

export interface ParagraphVectorMetadata {
    paragraphId: string;
    actId: string;
    chapterId: string;
    sceneId: string;
    position: number;
}

interface SearchSimilarParagraphsOptions {
    space: EmbeddingSpaceDescriptor;
    bookId: string;
    queryVector: number[];
    limit: number;
    minimumSimilarity?: number;
}

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

    async getBookParagraphStates(
        space: EmbeddingSpaceDescriptor,
        bookId: string,
    ): Promise<Map<string, BookParagraphVectorState>> {
        const table = await vectorDb.getManuscriptTable(space);
        const records = await table
            .query()
            .where(`bookId = '${escapeLanceSql(bookId)}'`)
            .select(['id', 'hash', 'actId', 'chapterId', 'sceneId', 'position'])
            .toArray();

        return new Map(records.map(record => {
            const state: BookParagraphVectorState = {
                id: String(record['id']),
                hash: String(record['hash']),
                actId: String(record['actId']),
                chapterId: String(record['chapterId']),
                sceneId: String(record['sceneId']),
                position: Number(record['position']),
            };
            return [state.id, state];
        }));
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

    async updateParagraphMetadata(
        space: EmbeddingSpaceDescriptor,
        metadata: ParagraphVectorMetadata[],
    ): Promise<void> {
        if (metadata.length === 0) return;

        const table = await vectorDb.getManuscriptTable(space);
        for (const paragraph of metadata) {
            await table.update({
                where: `id = '${escapeLanceSql(paragraph.paragraphId)}'`,
                values: {
                    actId: paragraph.actId,
                    chapterId: paragraph.chapterId,
                    sceneId: paragraph.sceneId,
                    position: paragraph.position,
                    updatedAt: Date.now(),
                },
            });
        }
    }

    async searchSimilar(
        options: SearchSimilarParagraphsOptions,
    ): Promise<SimilarParagraphResult[]> {
        const table = await vectorDb.getManuscriptTable(options.space);
        let search = table
            .vectorSearch(options.queryVector)
            .distanceType('cosine')
            .where(`bookId = '${escapeLanceSql(options.bookId)}'`);

        if (options.minimumSimilarity !== undefined) {
            search = search.distanceRange(undefined, 1 - options.minimumSimilarity);
        }

        const records = await search.limit(options.limit).toArray();

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
