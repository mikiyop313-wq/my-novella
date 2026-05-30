import { vectorDb } from '../lancedb.connection';
import { ManuscriptVectorRecord } from '../../shared/models/vector.model';

export class ParagraphVectorRepository {
    /**
     * Retrieves the existing hash values for a given list of paragraph IDs.
     */
    async getExistingParagraphHashes(paragraphIds: string[]): Promise<Map<string, string>> {
        if (paragraphIds.length === 0) return new Map();

        const table = await vectorDb.getManuscriptTable();
        const idsList = paragraphIds.map(id => `'${id}'`).join(', ');

        let existingRecords: any[] = [];
        try {
            existingRecords = await table
                .query()
                .where(`id IN (${idsList})`)
                .select(['id', 'hash'])
                .toArray();
        } catch (err) {
            console.warn('[VectorDB] Could not query existing records (might be empty/first run).');
        }

        return new Map(existingRecords.map(r => [r.id, r.hash]));
    }

    /**
     * Upserts a batch of manuscript vector records.
     */
    async upsertParagraphs(records: ManuscriptVectorRecord[]): Promise<void> {
        if (records.length === 0) return;

        const table = await vectorDb.getManuscriptTable();
        await table
            .mergeInsert('id')
            .whenMatchedUpdateAll()
            .whenNotMatchedInsertAll()
            .execute(records as unknown as Record<string, unknown>[]);
    }

    /**
     * Deletes a batch of manuscript vector records by ID.
     */
    async deleteParagraphs(paragraphIds: string[]): Promise<void> {
        if (paragraphIds.length === 0) return;

        const table = await vectorDb.getManuscriptTable();
        const idsList = paragraphIds.map(id => `'${id}'`).join(', ');
        await table.delete(`id IN (${idsList})`);
    }
}

export const paragraphVectorRepository = new ParagraphVectorRepository();
