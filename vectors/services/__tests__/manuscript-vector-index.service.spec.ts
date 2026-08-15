import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmbeddingProvider } from '../../embeddings/types';
import { hashParagraphVectorText } from '../../../shared/utils/paragraph-vector';

const mocks = vi.hoisted(() => ({
    getManuscript: vi.fn(),
    updateScene: vi.fn(),
    getEmbeddingProvider: vi.fn(),
    getLocalEmbeddingProvider: vi.fn(),
    selectLocalEmbeddingModel: vi.fn(),
    getBookParagraphStates: vi.fn(),
    updateParagraphMetadata: vi.fn(),
    upsertParagraphs: vi.fn(),
    deleteParagraphs: vi.fn(),
    searchSimilar: vi.fn(),
    retireLegacyManuscriptTable: vi.fn(),
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
    },
}));

vi.mock('../../embeddings/factory', () => ({
    getEmbeddingProvider: mocks.getEmbeddingProvider,
    getLocalEmbeddingProvider: mocks.getLocalEmbeddingProvider,
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
    vectorDb: { retireLegacyManuscriptTable: mocks.retireLegacyManuscriptTable },
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
        mocks.getLocalEmbeddingProvider.mockReturnValue(provider);
        mocks.getBookParagraphStates.mockResolvedValue(new Map());
        mocks.updateParagraphMetadata.mockResolvedValue(undefined);
        mocks.upsertParagraphs.mockResolvedValue(undefined);
        mocks.deleteParagraphs.mockResolvedValue(undefined);
        mocks.retireLegacyManuscriptTable.mockResolvedValue(undefined);
        mocks.selectLocalEmbeddingModel.mockResolvedValue(undefined);
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

    it('persists selection immediately and reports incremental reindex progress', async () => {
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

        const result = await service.selectLocalModel('book-1', 'BAAI/bge-m3', progress);

        expect(mocks.selectLocalEmbeddingModel).toHaveBeenCalledWith('book-1', 'BAAI/bge-m3');
        expect(progress).toHaveBeenLastCalledWith({
            bookId: 'book-1',
            modelName: 'BAAI/bge-m3',
            processedParagraphs: 2,
            totalParagraphs: 2,
        });
        expect(result).toMatchObject({
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

        const switching = service.selectLocalModel('book-1', 'BAAI/bge-m3');
        await vi.waitFor(() => expect(provider.embedDocuments).toHaveBeenCalledOnce());

        await expect(service.selectLocalModel(
            'book-1',
            'mixedbread-ai/mxbai-embed-large-v1',
        )).rejects.toThrow('already in progress');
        await expect(service.searchSimilar('book-1', 'query', 3)).rejects.toThrow(
            'unavailable while the book embedding index is rebuilding',
        );

        finishEmbedding();
        await switching;
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
