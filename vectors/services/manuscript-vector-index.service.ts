import { randomUUID } from 'crypto';

import { manuscriptRepository } from '../../db/repositories/manuscript.repository';
import type {
    ActDto,
    TiptapJsonDoc,
    TiptapNode,
} from '../../shared/models/manuscript.model';
import type {
    ManuscriptVectorRecord,
    SimilarParagraphResult,
} from '../../shared/models/vector.model';
import {
    hashParagraphVectorText,
    normalizeParagraphVectorText,
} from '../../shared/utils/paragraph-vector';
import { getEmbeddingProvider } from '../embeddings/factory';
import { assertEmbeddingDimensions, type EmbeddingProvider } from '../embeddings/types';
import { vectorDb } from '../lancedb.connection';
import { paragraphVectorRepository } from '../repositories/paragraph-vector.repository';

const EMBEDDING_BATCH_SIZE = 32;

interface IndexedParagraph {
    paragraphId: string;
    bookId: string;
    actId: string;
    chapterId: string;
    sceneId: string;
    text: string;
    hash: string;
    position: number;
}

/** Keeps a book's paragraph embeddings synchronized with its manuscript and searches them. */
export class ManuscriptVectorIndexService {
    private readonly inFlightReconciliations = new Map<string, Promise<EmbeddingProvider>>();

    /** Finds the paragraphs most semantically similar to a query after ensuring the index is current. */
    async searchSimilar(
        bookId: string,
        query: string,
        limit: number,
    ): Promise<SimilarParagraphResult[]> {
        const provider = await this.ensureBookIndexed(bookId);
        const queryVector = await provider.embedQuery(query);
        assertEmbeddingDimensions(provider, [queryVector]);
        return paragraphVectorRepository.searchSimilar(
            provider.space,
            bookId,
            queryVector,
            limit,
        );
    }

    /** Reconciles a book once per embedding configuration and returns the provider used for it. */
    async ensureBookIndexed(bookId: string): Promise<EmbeddingProvider> {
        const selectedProvider = await getEmbeddingProvider(bookId);
        const key = `${bookId}:${selectedProvider.space.provider}:${selectedProvider.space.model}:${selectedProvider.space.revision}`;
        const existing = this.inFlightReconciliations.get(key);
        if (existing) return existing;

        const reconciliation = this.reconcileBook(bookId, selectedProvider)
            .finally(() => this.inFlightReconciliations.delete(key));
        this.inFlightReconciliations.set(key, reconciliation);
        return reconciliation;
    }

    /** Updates changed vectors, removes stale ones, and retires obsolete embedding spaces. */
    private async reconcileBook(
        bookId: string,
        provider: EmbeddingProvider,
    ): Promise<EmbeddingProvider> {
        const manuscript = await manuscriptRepository.getManuscript('book', bookId) as ActDto[];
        const paragraphs = await this.collectParagraphs(bookId, manuscript);
        const existingHashes = await paragraphVectorRepository.getBookParagraphHashes(
            provider.space,
            bookId,
        );
        const currentIds = new Set(paragraphs.map(paragraph => paragraph.paragraphId));
        const staleIds = [...existingHashes.keys()].filter(id => !currentIds.has(id));
        const changed = paragraphs.filter(
            paragraph => existingHashes.get(paragraph.paragraphId) !== paragraph.hash,
        );

        for (let offset = 0; offset < changed.length; offset += EMBEDDING_BATCH_SIZE) {
            const batch = changed.slice(offset, offset + EMBEDDING_BATCH_SIZE);
            const vectors = await provider.embedDocuments(batch.map(paragraph => paragraph.text));
            assertEmbeddingDimensions(provider, vectors);
            const now = Date.now();
            const records: ManuscriptVectorRecord[] = batch.map((paragraph, index) => ({
                id: paragraph.paragraphId,
                bookId: paragraph.bookId,
                actId: paragraph.actId,
                chapterId: paragraph.chapterId,
                sceneId: paragraph.sceneId,
                text: paragraph.text,
                vector: vectors[index],
                provider: provider.space.provider,
                model: provider.space.model,
                revision: provider.space.revision,
                hash: paragraph.hash,
                position: paragraph.position,
                charCount: paragraph.text.length,
                createdAt: now,
                updatedAt: now,
            }));
            await paragraphVectorRepository.upsertParagraphs(provider.space, records);
        }

        await paragraphVectorRepository.deleteParagraphs(provider.space, staleIds);

        // Cleanup happens only after the selected provider has indexed successfully.
        await vectorDb.deleteBookFromOtherSpaces(bookId, provider.space);
        await vectorDb.retireLegacyManuscriptTable();
        return provider;
    }

    /** Extracts indexable paragraphs and persists missing paragraph identifiers in the manuscript. */
    private async collectParagraphs(
        bookId: string,
        manuscript: ActDto[],
    ): Promise<IndexedParagraph[]> {
        const paragraphs: IndexedParagraph[] = [];
        const sceneUpdates: Promise<unknown>[] = [];

        for (const act of manuscript) {
            for (const chapter of act.chapters ?? []) {
                for (const scene of chapter.scenes ?? []) {
                    if (!scene.prose) continue;

                    const prose = cloneDocument(scene.prose);
                    let proseChanged = false;

                    let position = 0;
                    const visit = (node: TiptapNode) => {
                        if (node.type !== 'paragraph') {
                            for (const child of node.content ?? []) visit(child);
                            return;
                        }
                        const text = normalizeParagraphVectorText(extractNodeText(node));
                        if (!text) {
                            position++;
                            return;
                        }

                        let paragraphId = typeof node.attrs?.['id'] === 'string'
                            ? node.attrs['id']
                            : '';
                        if (!paragraphId) {
                            paragraphId = randomUUID();
                            node.attrs = { ...node.attrs, id: paragraphId };
                            proseChanged = true;
                        }

                        paragraphs.push({
                            paragraphId,
                            bookId,
                            actId: act.id,
                            chapterId: chapter.id,
                            sceneId: scene.id,
                            text,
                            hash: hashParagraphVectorText(text),
                            position,
                        });
                        position++;
                    };
                    prose.content.forEach(visit);

                    if (proseChanged) {
                        sceneUpdates.push(manuscriptRepository.updateScene({
                            id: scene.id,
                            prose,
                        }));
                    }
                }
            }
        }

        await Promise.all(sceneUpdates);
        return paragraphs;
    }
}

/** Creates a mutable copy of a Tiptap document before assigning missing paragraph identifiers. */
function cloneDocument(document: TiptapJsonDoc): TiptapJsonDoc {
    return JSON.parse(JSON.stringify(document)) as TiptapJsonDoc;
}

/** Collects the text content from a Tiptap node and all of its descendants. */
function extractNodeText(node: TiptapNode): string {
    if (typeof node.text === 'string') return node.text;
    return (node.content ?? []).map(extractNodeText).join('');
}

export const manuscriptVectorIndexService = new ManuscriptVectorIndexService();
