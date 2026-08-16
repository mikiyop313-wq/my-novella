import { ipcMain } from 'electron';
import { paragraphVectorRepository } from '../../../vectors/repositories/paragraph-vector.repository';
import { getEmbeddingProvider } from '../../../vectors/embeddings/factory';
import {
    UpsertParagraphsPayload,
    DeleteParagraphsPayload,
    ManuscriptVectorRecord,
    SearchSimilarParagraphsPayload,
    BookIndexingConfiguration,
    ClearBookVectorIndexPayload,
} from '../../../shared/models/vector.model';
import { bookRepository } from '../../../db/repositories/book.repository';
import { db } from '../../../db';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';
import { assertEmbeddingDimensions } from '../../../vectors/embeddings/types';

// ---------------------------------------------------------------------------
// Helper — build the scene-hierarchy lookup map for a set of sceneIds
// ---------------------------------------------------------------------------

async function buildSceneMap(sceneIds: string[]) {
    const unique = [...new Set(sceneIds)];
    if (unique.length === 0) return new Map();
    const rows = await db
        .selectFrom('scenes')
        .leftJoin('chapters', 'chapters.id', 'scenes.chapterId')
        .leftJoin('acts', 'acts.id', 'chapters.actId')
        .select([
            'scenes.id',
            'scenes.chapterId',
            'chapters.actId',
            'acts.bookId',
        ])
        .where('scenes.id', 'in', unique)
        .execute();
    return new Map(rows.map(s => [s.id, {
        chapterId: s.chapterId,
        actId:     s.actId ?? 'unknown',
        bookId:    s.bookId ?? 'unknown',
    }]));
}

// ---------------------------------------------------------------------------
// Handler: vectors:upsertParagraphs
//
// Receives a batch of new/changed paragraphs, embeds them using the
// provider configured for the given book, and merges them into LanceDB.
// ---------------------------------------------------------------------------

async function handleUpsertParagraphs(payload: UpsertParagraphsPayload): Promise<void> {
    if (payload.upserts.length === 0) return;
    if (!await manuscriptVectorIndexService.isBookIndexingAvailable(payload.bookId)) return;
    await manuscriptVectorIndexService.runBookOperation(
        payload.bookId,
        () => handleUpsertParagraphsNow(payload),
    );
}

async function handleUpsertParagraphsNow(
    { bookId, upserts }: UpsertParagraphsPayload,
): Promise<void> {
    if (upserts.length === 0) return;

    console.log(`[VectorDB] upsertParagraphs — book=${bookId}, ${upserts.length} paragraph(s)`);

    // Skip paragraphs whose hash has not changed.
    const paragraphIds = upserts.map(u => u.paragraphId);
    const provider = await getEmbeddingProvider(bookId);
    const existingMap = await paragraphVectorRepository.getExistingParagraphHashes(
        provider.space,
        paragraphIds,
    );

    const toProcess = upserts.filter(u => existingMap.get(u.paragraphId) !== u.hash);

    if (toProcess.length === 0) {
        console.log('[VectorDB] ✓ All paragraphs are already up-to-date.');
        return;
    }

    console.log(`[VectorDB] Embedding ${toProcess.length} new/changed paragraph(s):`, toProcess.map(u => u.paragraphId));

    // Resolve the embedding provider for this book.
    const embedStart = Date.now();
    const vectors = await provider.embedDocuments(toProcess.map(u => u.text));
    assertEmbeddingDimensions(provider, vectors);
    console.log(`[VectorDB] Embedding done in ${Date.now() - embedStart}ms (provider: ${provider.space.model})`);

    // Enrich each paragraph with its act/chapter hierarchy from SQLite.
    const sceneMap = await buildSceneMap(toProcess.map(u => u.sceneId));
    const now      = Date.now();

    const records: ManuscriptVectorRecord[] = toProcess.map((u, i) => {
        const hier = sceneMap.get(u.sceneId);
        return {
            id:        u.paragraphId,
            bookId:    hier?.bookId    ?? bookId,
            actId:     hier?.actId     ?? 'unknown',
            chapterId: hier?.chapterId ?? 'unknown',
            sceneId:   u.sceneId,
            text:      u.text,
            vector:    vectors[i],
            provider:  provider.space.provider,
            model:     provider.space.model,
            revision:  provider.space.revision,
            hash:      u.hash,
            position:  u.position,
            charCount: u.text.length,
            updatedAt: now,
            createdAt: now,
        };
    });

    await paragraphVectorRepository.upsertParagraphs(provider.space, records);
    console.log(`[VectorDB] ✓ Upserted ${records.length} paragraph(s) in ${Date.now() - now}ms`);
}

// ---------------------------------------------------------------------------
// Handler: vectors:deleteParagraphs
//
// Receives a list of paragraphIds and removes them from LanceDB.
// ---------------------------------------------------------------------------

async function handleDeleteParagraphs(payload: DeleteParagraphsPayload): Promise<void> {
    if (payload.deletes.length === 0) return;
    if (!await manuscriptVectorIndexService.isBookIndexingAvailable(payload.bookId)) return;
    await manuscriptVectorIndexService.runBookOperation(
        payload.bookId,
        () => handleDeleteParagraphsNow(payload),
    );
}

async function handleDeleteParagraphsNow(
    { bookId, deletes }: DeleteParagraphsPayload,
): Promise<void> {
    if (deletes.length === 0) return;

    const ids = deletes.map(d => d.paragraphId);
    console.log(`[VectorDB] deleteParagraphs — ${ids.length} paragraph(s):`, ids);

    const provider = await getEmbeddingProvider(bookId);
    await paragraphVectorRepository.deleteParagraphs(provider.space, ids);
    console.log(`[VectorDB] ✓ Deleted ${ids.length} paragraph(s)`);
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function setupVectorHandlers() {
    ipcMain.handle(
        'vectors:getBookIndexSizes',
        async (_, payload: { bookId: string }) => {
            if (!payload || typeof payload.bookId !== 'string' || !payload.bookId.trim()) {
                throw new Error('Invalid book vector index size request.');
            }
            return manuscriptVectorIndexService.getBookIndexSizes(payload.bookId);
        },
    );

    ipcMain.handle(
        'vectors:clearBookIndex',
        async (_, payload: ClearBookVectorIndexPayload) => {
            const providers = ['local', 'openAI', 'voyage', 'openRouter'];
            if (
                !payload
                || typeof payload.bookId !== 'string'
                || !payload.bookId.trim()
                || !providers.includes(payload.provider)
                || typeof payload.model !== 'string'
                || !payload.model.trim()
            ) {
                throw new Error('Invalid book vector index cleanup request.');
            }
            await manuscriptVectorIndexService.clearBookIndex(payload);
        },
    );

    ipcMain.handle(
        'vectors:getBookIndexingConfiguration',
        async (_, payload: { bookId: string }): Promise<BookIndexingConfiguration> => {
            const [available, automaticIndexingEnabled] = await Promise.all([
                manuscriptVectorIndexService.isBookIndexingAvailable(payload.bookId),
                bookRepository.getAutomaticIndexingEnabled(payload.bookId),
            ]);
            return { available, automaticIndexingEnabled };
        },
    );

    /**
     * vectors:upsertParagraphs
     *
     * Embeds and upserts a batch of new or modified paragraphs.
     * Skips paragraphs whose hash matches the stored value (no change).
     */
    ipcMain.handle('vectors:upsertParagraphs', async (_, payload: UpsertParagraphsPayload) => {
        await handleUpsertParagraphs(payload);
    });

    /**
     * vectors:deleteParagraphs
     *
     * Removes a batch of paragraphs from LanceDB by their IDs.
     */
    ipcMain.handle('vectors:deleteParagraphs', async (_, payload: DeleteParagraphsPayload) => {
        await handleDeleteParagraphs(payload);
    });

    ipcMain.handle(
        'vectors:searchSimilar',
        async (_, payload: SearchSimilarParagraphsPayload) => {
            const query = payload.query?.trim();
            if (!payload.bookId || !query) return [];

            const limit = Math.min(Math.max(payload.limit ?? 3, 1), 10);
            return manuscriptVectorIndexService.searchSimilar(payload.bookId, query, limit);
        },
    );
}
