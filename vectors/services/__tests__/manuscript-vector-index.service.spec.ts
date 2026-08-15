import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmbeddingProvider } from '../../embeddings/types';
import { hashParagraphVectorText } from '../../../shared/utils/paragraph-vector';

const mocks = vi.hoisted(() => ({
    getManuscript: vi.fn(),
    updateScene: vi.fn(),
    getEmbeddingProvider: vi.fn(),
    getCloudEmbeddingProvider: vi.fn(),
    getLocalEmbeddingProvider: vi.fn(),
    getOpenRouterEmbeddingProvider: vi.fn(),
    selectLocalEmbeddingModel: vi.fn(),
    selectOpenRouterEmbeddingModel: vi.fn(),
    selectCloudEmbeddingProvider: vi.fn(),
    getVectorSearchEnabled: vi.fn(),
    getEmbeddingModel: vi.fn(),
    getLocalEmbeddingModel: vi.fn(),
    getBookById: vi.fn(),
    deleteBook: vi.fn(),
    isInstalled: vi.fn(),
    getVectorApiKey: vi.fn(),
    getBookParagraphStates: vi.fn(),
    updateParagraphMetadata: vi.fn(),
    upsertParagraphs: vi.fn(),
    deleteParagraphs: vi.fn(),
    searchSimilar: vi.fn(),
    retireLegacyManuscriptTable: vi.fn(),
    deleteBookVectors: vi.fn(),
}));

vi.mock('../../../db/repositories/manuscript.repository', () => ({
    manuscriptRepository: {
        getManuscript: mocks.getManuscript,
        updateScene: mocks.updateScene,
    },
}));

vi.mock('../../../db/repositories/book.repository', () => ({
    bookRepository: {
        selectLocalEmbeddingModel: mocks.selectLocalEmbeddingModel,
        selectOpenRouterEmbeddingModel: mocks.selectOpenRouterEmbeddingModel,
        selectCloudEmbeddingProvider: mocks.selectCloudEmbeddingProvider,
        getVectorSearchEnabled: mocks.getVectorSearchEnabled,
        getEmbeddingModel: mocks.getEmbeddingModel,
        getLocalEmbeddingModel: mocks.getLocalEmbeddingModel,
        getById: mocks.getBookById,
        delete: mocks.deleteBook,
    },
}));

vi.mock('../../embeddings/local-model-manager', () => ({
    localEmbeddingModelManager: { isInstalled: mocks.isInstalled },
}));

vi.mock('../../embeddings/factory', () => ({
    getCloudEmbeddingProvider: mocks.getCloudEmbeddingProvider,
    getEmbeddingProvider: mocks.getEmbeddingProvider,
    getLocalEmbeddingProvider: mocks.getLocalEmbeddingProvider,
    getOpenRouterEmbeddingProvider: mocks.getOpenRouterEmbeddingProvider,
}));

vi.mock('../../../electron/domain/vector/vector-api-key.service', () => ({
    vectorApiKeyService: { getApiKey: mocks.getVectorApiKey },
}));

vi.mock('../../repositories/paragraph-vector.repository', () => ({
    paragraphVectorRepository: {
        getBookParagraphStates: mocks.getBookParagraphStates,
        updateParagraphMetadata: mocks.updateParagraphMetadata,
        upsertParagraphs: mocks.upsertParagraphs,
        deleteParagraphs: mocks.deleteParagraphs,
        searchSimilar: mocks.searchSimilar,
    },
}));

vi.mock('../../lancedb.connection', () => ({
    vectorDb: {
        retireLegacyManuscriptTable: mocks.retireLegacyManuscriptTable,
        deleteBookVectors: mocks.deleteBookVectors,
    },
}));

import { ManuscriptVectorIndexService } from '../manuscript-vector-index.service';

describe('ManuscriptVectorIndexService', () => {
    let service: ManuscriptVectorIndexService;
    let provider: EmbeddingProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = {
            space: {
                provider: 'local',
                model: 'BAAI/bge-m3',
                dimensions: 3,
                revision: '1',
            },
            embedDocuments: vi.fn(async texts => texts.map(() => [1, 2, 3])),
            embedQuery: vi.fn().mockResolvedValue([1, 2, 3]),
        };
        mocks.getEmbeddingProvider.mockResolvedValue(provider);
        mocks.getCloudEmbeddingProvider.mockResolvedValue(provider);
        mocks.getLocalEmbeddingProvider.mockReturnValue(provider);
        mocks.getOpenRouterEmbeddingProvider.mockResolvedValue(provider);
        mocks.getBookParagraphStates.mockResolvedValue(new Map());
        mocks.updateParagraphMetadata.mockResolvedValue(undefined);
        mocks.upsertParagraphs.mockResolvedValue(undefined);
        mocks.deleteParagraphs.mockResolvedValue(undefined);
        mocks.retireLegacyManuscriptTable.mockResolvedValue(undefined);
        mocks.selectLocalEmbeddingModel.mockResolvedValue(undefined);
        mocks.selectOpenRouterEmbeddingModel.mockResolvedValue(undefined);
        mocks.selectCloudEmbeddingProvider.mockResolvedValue(undefined);
        mocks.getVectorSearchEnabled.mockResolvedValue(true);
        mocks.getEmbeddingModel.mockResolvedValue('local');
        mocks.getLocalEmbeddingModel.mockResolvedValue('BAAI/bge-m3');
        mocks.getBookById.mockResolvedValue({ id: 'book-1' });
        mocks.deleteBook.mockResolvedValue({ success: true });
        mocks.deleteBookVectors.mockResolvedValue(undefined);
        mocks.isInstalled.mockResolvedValue(true);
        mocks.getVectorApiKey.mockResolvedValue('configured-key');
        mocks.searchSimilar.mockResolvedValue([]);
        mocks.updateScene.mockResolvedValue(undefined);
        mocks.getManuscript.mockResolvedValue(manuscript([
            paragraph('paragraph-1', 'First paragraph.'),
            paragraph('paragraph-2', 'Second paragraph.'),
        ]));
        service = new ManuscriptVectorIndexService();
    });

    it('reuses target-space hashes, updates metadata, embeds changes, and deletes stale rows', async () => {
        mocks.getBookParagraphStates.mockResolvedValue(new Map([
            ['paragraph-1', {
                id: 'paragraph-1',
                hash: hashParagraphVectorText('First paragraph.'),
                actId: 'old-act',
                chapterId: 'old-chapter',
                sceneId: 'old-scene',
                position: 9,
            }],
            ['deleted-paragraph', {
                id: 'deleted-paragraph',
                hash: 'old',
                actId: 'act-1',
                chapterId: 'chapter-1',
                sceneId: 'scene-1',
                position: 2,
            }],
        ]));

        await service.ensureBookIndexed('book-1');

        expect(provider.embedDocuments).toHaveBeenCalledWith(['Second paragraph.']);
        expect(mocks.updateParagraphMetadata).toHaveBeenCalledWith(provider.space, [{
            paragraphId: 'paragraph-1',
            actId: 'act-1',
            chapterId: 'chapter-1',
            sceneId: 'scene-1',
            position: 0,
        }]);
        expect(mocks.upsertParagraphs).toHaveBeenCalledWith(
            provider.space,
            [expect.objectContaining({ id: 'paragraph-2', model: 'BAAI/bge-m3' })],
        );
        expect(mocks.deleteParagraphs).toHaveBeenCalledWith(
            provider.space,
            ['deleted-paragraph'],
        );
        expect(mocks.retireLegacyManuscriptTable).toHaveBeenCalledOnce();
    });

    it('treats hashes stored by another embedding space as unavailable', async () => {
        mocks.getBookParagraphStates.mockResolvedValue(new Map());

        await service.ensureBookIndexed('book-1');

        expect(provider.embedDocuments).toHaveBeenCalledWith([
            'First paragraph.',
            'Second paragraph.',
        ]);
    });

    it('persists selection and reports incremental reindex progress', async () => {
        const progress = vi.fn();
        mocks.getBookParagraphStates.mockResolvedValue(new Map([
            ['paragraph-1', {
                id: 'paragraph-1',
                hash: hashParagraphVectorText('First paragraph.'),
                actId: 'act-1',
                chapterId: 'chapter-1',
                sceneId: 'scene-1',
                position: 0,
            }],
        ]));

        const result = await service.selectLocalModel('book-1', 'BAAI/bge-m3', true, progress);

        expect(mocks.selectLocalEmbeddingModel).toHaveBeenCalledWith('book-1', 'BAAI/bge-m3');
        expect(progress).toHaveBeenLastCalledWith({
            bookId: 'book-1',
            modelName: 'BAAI/bge-m3',
            processedParagraphs: 2,
            totalParagraphs: 2,
        });
        expect(result).toMatchObject({
            reindexed: true,
            reusedParagraphs: 1,
            embeddedParagraphs: 1,
            deletedParagraphs: 0,
        });
    });

    it('rejects overlapping switches and semantic search while switching', async () => {
        let finishEmbedding!: () => void;
        vi.mocked(provider.embedDocuments).mockImplementationOnce(
            () => new Promise<number[][]>(resolve => {
                finishEmbedding = () => resolve([[1, 2, 3], [1, 2, 3]]);
            }),
        );

        const switching = service.selectLocalModel('book-1', 'BAAI/bge-m3', true);
        await vi.waitFor(() => expect(provider.embedDocuments).toHaveBeenCalledOnce());

        await expect(service.selectLocalModel(
            'book-1',
            'mixedbread-ai/mxbai-embed-large-v1',
            true,
        )).rejects.toThrow('already in progress');
        await expect(service.searchSimilar('book-1', 'query', 3)).rejects.toThrow(
            'unavailable while the book embedding index is rebuilding',
        );

        finishEmbedding();
        await switching;
    });

    it('persists a selection without reconciling when reindex is false', async () => {
        await expect(service.selectLocalModel(
            'book-1',
            'BAAI/bge-m3',
            false,
        )).resolves.toEqual({
            bookId: 'book-1',
            modelName: 'BAAI/bge-m3',
            reindexed: false,
        });

        expect(mocks.selectLocalEmbeddingModel).toHaveBeenCalledWith('book-1', 'BAAI/bge-m3');
        expect(mocks.getManuscript).not.toHaveBeenCalled();
    });

    it('persists an explicit OpenRouter selection only after successful reindexing', async () => {
        provider = {
            ...provider,
            space: {
                provider: 'openRouter',
                model: 'openai/text-embedding-3-small',
                dimensions: 3,
                revision: '1',
            },
        };
        mocks.getOpenRouterEmbeddingProvider.mockResolvedValue(provider);
        const progress = vi.fn();

        await expect(service.selectOpenRouterModel(
            'book-1',
            'openai/text-embedding-3-small',
            true,
            progress,
        )).resolves.toMatchObject({
            bookId: 'book-1',
            modelName: 'openai/text-embedding-3-small',
            reindexed: true,
            embeddedParagraphs: 2,
        });

        expect(mocks.getOpenRouterEmbeddingProvider).toHaveBeenCalledWith(
            'openai/text-embedding-3-small',
        );
        expect(mocks.selectOpenRouterEmbeddingModel).toHaveBeenCalledWith(
            'book-1',
            'openai/text-embedding-3-small',
        );
        expect(progress).toHaveBeenLastCalledWith({
            bookId: 'book-1',
            modelName: 'openai/text-embedding-3-small',
            processedParagraphs: 2,
            totalParagraphs: 2,
        });
    });

    it('reindexes before persisting a fixed-model cloud provider selection', async () => {
        provider = {
            ...provider,
            space: {
                provider: 'openAI',
                model: 'text-embedding-3-large',
                dimensions: 3,
                revision: '1',
            },
        };
        mocks.getCloudEmbeddingProvider.mockResolvedValue(provider);
        const progress = vi.fn();

        await expect(service.selectCloudProvider(
            'book-1',
            'openai',
            true,
            progress,
        )).resolves.toMatchObject({
            bookId: 'book-1',
            providerId: 'openai',
            reindexed: true,
            embeddedParagraphs: 2,
        });

        expect(mocks.getCloudEmbeddingProvider).toHaveBeenCalledWith('openai');
        expect(mocks.selectCloudEmbeddingProvider).toHaveBeenCalledWith('book-1', 'openai');
        expect(progress).toHaveBeenLastCalledWith({
            bookId: 'book-1',
            providerId: 'openai',
            processedParagraphs: 2,
            totalParagraphs: 2,
        });
    });

    it('validates and persists a cloud provider without reconciling when indexing is disabled', async () => {
        await expect(service.selectCloudProvider('book-1', 'voyage', false)).resolves.toEqual({
            bookId: 'book-1',
            providerId: 'voyage',
            reindexed: false,
        });

        expect(mocks.getCloudEmbeddingProvider).toHaveBeenCalledWith('voyage');
        expect(mocks.selectCloudEmbeddingProvider).toHaveBeenCalledWith('book-1', 'voyage');
        expect(mocks.getManuscript).not.toHaveBeenCalled();
    });

    it('does not persist a cloud provider when reconciliation fails', async () => {
        vi.mocked(provider.embedDocuments).mockRejectedValueOnce(new Error('cloud embedding failed'));

        await expect(service.selectCloudProvider('book-1', 'openai', true)).rejects.toThrow(
            'cloud embedding failed',
        );

        expect(mocks.selectCloudEmbeddingProvider).not.toHaveBeenCalled();
    });

    it('preserves the previous selection when OpenRouter reconciliation fails', async () => {
        vi.mocked(provider.embedDocuments).mockRejectedValueOnce(new Error('embedding failed'));

        await expect(service.selectOpenRouterModel(
            'book-1',
            'qwen/qwen3-embedding-4b',
            true,
        )).rejects.toThrow('embedding failed');

        expect(mocks.selectOpenRouterEmbeddingModel).not.toHaveBeenCalled();
    });

    it('returns no search results when the preference is disabled or the model is missing', async () => {
        mocks.getVectorSearchEnabled.mockResolvedValueOnce(false);
        await expect(service.searchSimilar('book-1', 'query', 3)).resolves.toEqual([]);

        mocks.isInstalled.mockResolvedValueOnce(false);
        await expect(service.searchSimilar('book-1', 'query', 3)).resolves.toEqual([]);

        expect(mocks.searchSimilar).not.toHaveBeenCalled();
        expect(provider.embedQuery).not.toHaveBeenCalled();
    });

    it('reports cloud indexing as unavailable when the selected provider has no key', async () => {
        mocks.getEmbeddingModel.mockResolvedValue('openAI');
        mocks.getVectorApiKey.mockResolvedValue(null);

        await expect(service.isBookIndexingAvailable('book-1')).resolves.toBe(false);
        expect(mocks.getVectorApiKey).toHaveBeenCalledWith('openai');

        mocks.getVectorApiKey.mockResolvedValue('openai-key');
        await expect(service.isBookIndexingAvailable('book-1')).resolves.toBe(true);
    });

    it('waits for queued vector work before cleaning vectors and deleting the book', async () => {
        let finishOperation!: () => void;
        const operation = vi.fn(() => new Promise<void>(resolve => {
            finishOperation = resolve;
        }));
        const queued = service.runBookOperation('book-1', operation);
        await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());

        const deletion = service.deleteBook('book-1');
        await expect(service.runBookOperation('book-1', async () => undefined)).rejects.toThrow(
            'unavailable while the book is being deleted',
        );
        expect(mocks.deleteBookVectors).not.toHaveBeenCalled();

        finishOperation();
        await queued;
        await expect(deletion).resolves.toEqual({ success: true });

        expect(mocks.deleteBookVectors).toHaveBeenCalledWith('book-1');
        expect(mocks.deleteBook).toHaveBeenCalledWith('book-1');
        expect(mocks.deleteBookVectors.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.deleteBook.mock.invocationCallOrder[0],
        );
    });

    it('keeps the book when vector cleanup fails and releases the deletion lock', async () => {
        mocks.deleteBookVectors.mockRejectedValueOnce(new Error('cleanup failed'));

        await expect(service.deleteBook('book-1')).rejects.toThrow('cleanup failed');

        expect(mocks.deleteBook).not.toHaveBeenCalled();
        await expect(service.runBookOperation('book-1', async () => 'available')).resolves.toBe(
            'available',
        );
    });

    it('rejects vector work for a missing book', async () => {
        mocks.getBookById.mockResolvedValue(undefined);

        await expect(service.runBookOperation('missing-book', async () => undefined)).rejects.toThrow(
            'Book not found: missing-book',
        );
        await expect(service.isBookIndexingAvailable('missing-book')).resolves.toBe(false);
    });
});

function manuscript(paragraphs: Record<string, unknown>[]) {
    return [{
        id: 'act-1',
        chapters: [{
            id: 'chapter-1',
            scenes: [{
                id: 'scene-1',
                prose: { type: 'doc', content: paragraphs },
            }],
        }],
    }];
}

function paragraph(id: string, text: string): Record<string, unknown> {
    return {
        type: 'paragraph',
        attrs: { id },
        content: [{ type: 'text', text }],
    };
}
