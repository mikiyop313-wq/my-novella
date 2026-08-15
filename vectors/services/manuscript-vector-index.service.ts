import { randomUUID } from 'crypto';

import { manuscriptRepository } from '../../db/repositories/manuscript.repository';
import type {
    ActDto,
    TiptapJsonDoc,
    TiptapNode,
} from '../../shared/models/manuscript.model';
import type {
    BookCloudEmbeddingReindexProgress,
    BookCloudEmbeddingSelectionResult,
    BookEmbeddingReindexProgress,
    BookEmbeddingSelectionResult,
    BookOpenRouterEmbeddingReindexProgress,
    BookOpenRouterEmbeddingSelectionResult,
    ClearBookVectorIndexPayload,
    LocalEmbeddingModelName,
    ManuscriptVectorRecord,
    OpenRouterEmbeddingModelName,
    SimilarParagraphResult,
    VectorCloudProviderId,
} from '../../shared/models/vector.model';
import {
    hashParagraphVectorText,
    normalizeParagraphVectorText,
} from '../../shared/utils/paragraph-vector';
import { bookRepository } from '../../db/repositories/book.repository';
import {
    getCloudEmbeddingProvider,
    getEmbeddingProvider,
    getLocalEmbeddingProvider,
    getOpenRouterEmbeddingProvider,
} from '../embeddings/factory';
import { vectorApiKeyService } from '../../electron/domain/vector/vector-api-key.service';
import { localEmbeddingModelManager } from '../embeddings/local-model-manager';
import { getOpenRouterEmbeddingModelDefinition } from '../embeddings/openrouter-model-definition';
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

interface ReconciliationSummary {
    totalParagraphs: number;
    reusedParagraphs: number;
    embeddedParagraphs: number;
    metadataUpdatedParagraphs: number;
    deletedParagraphs: number;
}

/** Keeps a book's paragraph embeddings synchronized with its manuscript and searches them. */
export class ManuscriptVectorIndexService {
    /** Returns per-model logical storage estimates for this book's retained indexes. */
    async getBookIndexSizes(bookId: string) {
        return vectorDb.getBookIndexSizes(bookId);
    }

    /** Clears one retained model index while serializing against other work for the book. */
    async clearBookIndex(payload: ClearBookVectorIndexPayload): Promise<void> {
        await this.runBookOperation(payload.bookId, () => (
            vectorDb.clearBookIndex(payload.bookId, payload.provider, payload.model)
        ));
    }

    private readonly bookOperationTails = new Map<string, Promise<void>>();
    private readonly switchingBooks = new Set<string>();
    private readonly deletingBooks = new Set<string>();

    /** Finds the paragraphs most semantically similar to a query after ensuring the index is current. */
    async searchSimilar(
        bookId: string,
        query: string,
        limit: number,
    ): Promise<SimilarParagraphResult[]> {
        if (!await this.isBookIndexingAvailable(bookId)) return [];

        if (this.switchingBooks.has(bookId)) {
            throw new Error('Semantic search is unavailable while the book embedding index is rebuilding.');
        }

        return this.runBookOperation(bookId, async () => {
            const provider = await this.ensureBookIndexedNow(bookId);
            const queryVector = await provider.embedQuery(query);
            assertEmbeddingDimensions(provider, [queryVector]);
            return paragraphVectorRepository.searchSimilar(
                provider.space,
                bookId,
                queryVector,
                limit,
            );
        });
    }

    /** Reconciles the active embedding space and returns its provider. */
    async ensureBookIndexed(bookId: string): Promise<EmbeddingProvider> {
        return this.runBookOperation(bookId, () => this.ensureBookIndexedNow(bookId));
    }

    /** Returns whether the book preference and selected provider both permit vector work. */
    async isBookIndexingAvailable(bookId: string): Promise<boolean> {
        if (this.deletingBooks.has(bookId)) return false;
        if (!await bookRepository.getById(bookId)) return false;
        if (!await bookRepository.getVectorSearchEnabled(bookId)) return false;
        const model = await bookRepository.getEmbeddingModel(bookId);
        if (model === 'local') {
            const modelName = await bookRepository.getLocalEmbeddingModel(bookId);
            return localEmbeddingModelManager.isInstalled(modelName);
        }
        const providerId = model === 'openAI'
            ? 'openai'
            : model === 'openRouter' ? 'openrouter' : 'voyage';
        return await vectorApiKeyService.getApiKey(providerId) !== null;
    }

    /** Selects a fixed-model cloud provider, reconciling its vector space when requested. */
    async selectCloudProvider(
        bookId: string,
        providerId: VectorCloudProviderId,
        reindex: boolean,
        onProgress?: (progress: BookCloudEmbeddingReindexProgress) => void,
    ): Promise<BookCloudEmbeddingSelectionResult> {
        this.assertBookNotDeleting(bookId);
        if (this.switchingBooks.has(bookId)) {
            throw new Error('An embedding model switch is already in progress for this book.');
        }

        this.switchingBooks.add(bookId);
        try {
            const provider = await getCloudEmbeddingProvider(providerId);
            if (!reindex) {
                await bookRepository.selectCloudEmbeddingProvider(bookId, providerId);
                return { bookId, providerId, reindexed: false };
            }

            const result = await this.runBookOperation(bookId, async () => {
                const summary = await this.reconcileBook(bookId, provider, (
                    processedParagraphs,
                    totalParagraphs,
                ) => onProgress?.({
                    bookId,
                    providerId,
                    processedParagraphs,
                    totalParagraphs,
                }));
                return { bookId, providerId, reindexed: true as const, ...summary };
            });
            await bookRepository.selectCloudEmbeddingProvider(bookId, providerId);
            return result;
        } finally {
            this.switchingBooks.delete(bookId);
        }
    }

    /** Serializes one vector operation with all other vector work for the same book. */
    async runBookOperation<T>(bookId: string, operation: () => Promise<T>): Promise<T> {
        this.assertBookNotDeleting(bookId);
        return this.enqueueBookOperation(bookId, async () => {
            if (!await bookRepository.getById(bookId)) {
                throw new Error(`Book not found: ${bookId}`);
            }
            return operation();
        });
    }

    /** Cleans all vector spaces before permanently deleting a book. */
    async deleteBook(bookId: string): Promise<{ success: boolean }> {
        this.assertBookNotDeleting(bookId);
        this.deletingBooks.add(bookId);
        try {
            return await this.enqueueBookOperation(bookId, async () => {
                await vectorDb.deleteBookVectors(bookId);
                return bookRepository.delete(bookId);
            });
        } finally {
            this.deletingBooks.delete(bookId);
        }
    }

    private assertBookNotDeleting(bookId: string): void {
        if (this.deletingBooks.has(bookId)) {
            throw new Error('Vector operations are unavailable while the book is being deleted.');
        }
    }

    private async enqueueBookOperation<T>(
        bookId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = this.bookOperationTails.get(bookId) ?? Promise.resolve();
        let release!: () => void;
        const tail = new Promise<void>(resolve => {
            release = resolve;
        });
        this.bookOperationTails.set(bookId, tail);

        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
            if (this.bookOperationTails.get(bookId) === tail) {
                this.bookOperationTails.delete(bookId);
            }
        }
    }

    /** Selects an installed local model, reconciling its retained vector space when requested. */
    async selectLocalModel(
        bookId: string,
        modelName: LocalEmbeddingModelName,
        reindex: boolean,
        onProgress?: (progress: BookEmbeddingReindexProgress) => void,
    ): Promise<BookEmbeddingSelectionResult> {
        this.assertBookNotDeleting(bookId);
        if (this.switchingBooks.has(bookId)) {
            throw new Error('An embedding model switch is already in progress for this book.');
        }

        this.switchingBooks.add(bookId);
        try {
            if (!reindex) {
                await bookRepository.selectLocalEmbeddingModel(bookId, modelName);
                return { bookId, modelName, reindexed: false };
            }

            const result = await this.runBookOperation(bookId, async () => {
                const provider = getLocalEmbeddingProvider(modelName);
                const summary = await this.reconcileBook(bookId, provider, (
                    processedParagraphs,
                    totalParagraphs,
                ) => {
                    onProgress?.({
                        bookId,
                        modelName,
                        processedParagraphs,
                        totalParagraphs,
                    });
                });
                return { bookId, modelName, reindexed: true as const, ...summary };
            });
            await bookRepository.selectLocalEmbeddingModel(bookId, modelName);
            return result;
        } finally {
            this.switchingBooks.delete(bookId);
        }
    }

    /** Selects a curated OpenRouter model, reconciling its vector space when requested. */
    async selectOpenRouterModel(
        bookId: string,
        modelName: OpenRouterEmbeddingModelName,
        reindex: boolean,
        onProgress?: (progress: BookOpenRouterEmbeddingReindexProgress) => void,
    ): Promise<BookOpenRouterEmbeddingSelectionResult> {
        this.assertBookNotDeleting(bookId);
        const definition = getOpenRouterEmbeddingModelDefinition(modelName);
        if (this.switchingBooks.has(bookId)) {
            throw new Error('An embedding model switch is already in progress for this book.');
        }

        this.switchingBooks.add(bookId);
        try {
            const provider = await getOpenRouterEmbeddingProvider(definition.modelName);
            if (!reindex) {
                await bookRepository.selectOpenRouterEmbeddingModel(bookId, definition.modelName);
                return {
                    bookId,
                    modelName: definition.modelName,
                    reindexed: false,
                };
            }

            const result = await this.runBookOperation(bookId, async () => {
                const summary = await this.reconcileBook(bookId, provider, (
                    processedParagraphs,
                    totalParagraphs,
                ) => {
                    onProgress?.({
                        bookId,
                        modelName: definition.modelName,
                        processedParagraphs,
                        totalParagraphs,
                    });
                });
                return {
                    bookId,
                    modelName: definition.modelName,
                    reindexed: true as const,
                    ...summary,
                };
            });
            await bookRepository.selectOpenRouterEmbeddingModel(bookId, definition.modelName);
            return result;
        } finally {
            this.switchingBooks.delete(bookId);
        }
    }

    private async ensureBookIndexedNow(bookId: string): Promise<EmbeddingProvider> {
        const provider = await getEmbeddingProvider(bookId);
        await this.reconcileBook(bookId, provider);
        return provider;
    }

    /** Updates changed vectors, removes stale ones, and retires obsolete embedding spaces. */
    private async reconcileBook(
        bookId: string,
        provider: EmbeddingProvider,
        onProgress?: (processedParagraphs: number, totalParagraphs: number) => void,
    ): Promise<ReconciliationSummary> {
        const manuscript = await manuscriptRepository.getManuscript('book', bookId) as ActDto[];
        const paragraphs = await this.collectParagraphs(bookId, manuscript);
        const existingStates = await paragraphVectorRepository.getBookParagraphStates(
            provider.space,
            bookId,
        );
        const currentIds = new Set(paragraphs.map(paragraph => paragraph.paragraphId));
        const staleIds = [...existingStates.keys()].filter(id => !currentIds.has(id));
        const changed = paragraphs.filter(
            paragraph => existingStates.get(paragraph.paragraphId)?.hash !== paragraph.hash,
        );
        const reused = paragraphs.filter(
            paragraph => existingStates.get(paragraph.paragraphId)?.hash === paragraph.hash,
        );
        const metadataChanged = reused.filter(paragraph => {
            const state = existingStates.get(paragraph.paragraphId)!;
            return state.actId !== paragraph.actId
                || state.chapterId !== paragraph.chapterId
                || state.sceneId !== paragraph.sceneId
                || state.position !== paragraph.position;
        });

        await paragraphVectorRepository.updateParagraphMetadata(
            provider.space,
            metadataChanged.map(paragraph => ({
                paragraphId: paragraph.paragraphId,
                actId: paragraph.actId,
                chapterId: paragraph.chapterId,
                sceneId: paragraph.sceneId,
                position: paragraph.position,
            })),
        );
        onProgress?.(reused.length, paragraphs.length);

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
            onProgress?.(
                reused.length + Math.min(offset + batch.length, changed.length),
                paragraphs.length,
            );
        }

        await paragraphVectorRepository.deleteParagraphs(provider.space, staleIds);

        await vectorDb.retireLegacyManuscriptTable();
        return {
            totalParagraphs: paragraphs.length,
            reusedParagraphs: reused.length,
            embeddedParagraphs: changed.length,
            metadataUpdatedParagraphs: metadataChanged.length,
            deletedParagraphs: staleIds.length,
        };
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
