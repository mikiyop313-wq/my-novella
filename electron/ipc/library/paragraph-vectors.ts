import { ipcMain } from 'electron';
import { paragraphVectorRepository } from '../../../vectors/repositories/paragraph-vector.repository';
import { getEmbeddingProvider } from '../../../vectors/embeddings/factory';
import {
    UpsertParagraphsPayload,
    DeleteParagraphsPayload,
    ManuscriptVectorRecord,
} from '../../../shared/models/vector.model';
import { db } from '../../../db';
import { inArray } from 'drizzle-orm';
import { scene } from '../../../db/schema';

// ---------------------------------------------------------------------------
// Helper — build the scene-hierarchy lookup map for a set of sceneIds
// ---------------------------------------------------------------------------

async function buildSceneMap(sceneIds: string[]) {
    const unique = [...new Set(sceneIds)];
    const rows = await db.query.scene.findMany({
        where: inArray(scene.id, unique),
        with: { chapter: { with: { act: true } } },
    });
    return new Map(rows.map(s => [s.id, {
        chapterId: s.chapterId,
        actId:     s.chapter?.actId    ?? 'unknown',
        bookId:    s.chapter?.act?.bookId ?? 'unknown',
    }]));
}

// ---------------------------------------------------------------------------
// Handler: vectors:upsertParagraphs
//
// Receives a batch of new/changed paragraphs, embeds them using the
// provider configured for the given book, and merges them into LanceDB.
// ---------------------------------------------------------------------------

async function handleUpsertParagraphs({ bookId, upserts }: UpsertParagraphsPayload): Promise<void> {
    if (upserts.length === 0) return;

    console.log(`[VectorDB] upsertParagraphs — book=${bookId}, ${upserts.length} paragraph(s)`);

    // Skip paragraphs whose hash has not changed.
    const paragraphIds = upserts.map(u => u.paragraphId);
    const existingMap  = await paragraphVectorRepository.getExistingParagraphHashes(paragraphIds);

    const toProcess = upserts.filter(u => existingMap.get(u.paragraphId) !== u.hash);

    if (toProcess.length === 0) {
        console.log('[VectorDB] ✓ All paragraphs are already up-to-date.');
        return;
    }

    console.log(`[VectorDB] Embedding ${toProcess.length} new/changed paragraph(s):`, toProcess.map(u => u.paragraphId));

    // Resolve the embedding provider for this book.
    const provider   = await getEmbeddingProvider(bookId);
    const embedStart = Date.now();
    const vectors    = await provider.embedBatch(toProcess.map(u => u.text));
    console.log(`[VectorDB] Embedding done in ${Date.now() - embedStart}ms (provider: ${provider.name})`);

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
            model:     provider.name.includes('openai') ? 'openAI'
                     : provider.name.includes('voyage') ? 'voyage'
                     : 'local',
            hash:      u.hash,
            position:  u.position,
            charCount: u.text.length,
            updatedAt: now,
            createdAt: now,
        };
    });

    await paragraphVectorRepository.upsertParagraphs(records);
    console.log(`[VectorDB] ✓ Upserted ${records.length} paragraph(s) in ${Date.now() - now}ms`);
}

// ---------------------------------------------------------------------------
// Handler: vectors:deleteParagraphs
//
// Receives a list of paragraphIds and removes them from LanceDB.
// ---------------------------------------------------------------------------

async function handleDeleteParagraphs({ deletes }: DeleteParagraphsPayload): Promise<void> {
    if (deletes.length === 0) return;

    const ids = deletes.map(d => d.paragraphId);
    console.log(`[VectorDB] deleteParagraphs — ${ids.length} paragraph(s):`, ids);

    await paragraphVectorRepository.deleteParagraphs(ids);
    console.log(`[VectorDB] ✓ Deleted ${ids.length} paragraph(s)`);
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function setupVectorHandlers() {
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
}
