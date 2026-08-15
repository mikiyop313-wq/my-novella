import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => unknown>(),
    deleteBook: vi.fn(),
    addBook: vi.fn(),
    getAllBooks: vi.fn(),
    resolveBooks: vi.fn(),
    resolveForNewBook: vi.fn(),
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
            mocks.handlers.set(channel, handler);
        }),
    },
}));

vi.mock('../../../../db/repositories/book.repository', () => ({
    bookRepository: {
        getAll: mocks.getAllBooks,
        add: mocks.addBook,
        update: vi.fn(),
        getLanguages: vi.fn(),
        getGenres: vi.fn(),
        getTropes: vi.fn(),
    },
}));

vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
    manuscriptVectorIndexService: { deleteBook: mocks.deleteBook },
}));

vi.mock('../../../../vectors/services/embedding-selection-resolver.service', () => ({
    embeddingSelectionResolverService: {
        resolveBooks: mocks.resolveBooks,
        resolveForNewBook: mocks.resolveForNewBook,
    },
}));

import { setupLibraryHandlers } from '../library';

describe('library IPC handlers', () => {
    beforeEach(() => {
        mocks.handlers.clear();
        vi.clearAllMocks();
        mocks.deleteBook.mockResolvedValue({ success: true });
        mocks.resolveBooks.mockImplementation(async books => books);
        mocks.resolveForNewBook.mockResolvedValue({
            embeddingModel: null,
            localEmbeddingModel: null,
            openRouterEmbeddingModel: null,
        });
        setupLibraryHandlers();
    });

    it('routes book deletion through coordinated vector cleanup', async () => {
        await expect(
            mocks.handlers.get('library:delete-book')?.({}, 'book-1'),
        ).resolves.toEqual({ success: true });

        expect(mocks.deleteBook).toHaveBeenCalledWith('book-1');
    });

    it('propagates vector cleanup failures', async () => {
        mocks.deleteBook.mockRejectedValueOnce(new Error('cleanup failed'));

        await expect(
            mocks.handlers.get('library:delete-book')?.({}, 'book-1'),
        ).rejects.toThrow('cleanup failed');
    });

    it('applies the first available embedding selection when adding a book', async () => {
        const selection = {
            embeddingModel: 'openRouter',
            localEmbeddingModel: null,
            openRouterEmbeddingModel: 'nvidia/nemotron-3-embed-1b:free',
        };
        mocks.resolveForNewBook.mockResolvedValue(selection);
        mocks.addBook.mockResolvedValue({ id: 'book-1' });

        await mocks.handlers.get('library:add-book')?.({}, {
            title: 'Book',
            settings: { language: 'english' },
        });

        expect(mocks.addBook).toHaveBeenCalledWith(expect.objectContaining({
            settings: expect.objectContaining(selection),
        }));
    });

    it('repairs unavailable selections when loading existing books', async () => {
        const books = [{ id: 'book-1' }];
        const resolvedBooks = [{ id: 'book-1', settings: { embeddingModel: 'openAI' } }];
        mocks.getAllBooks.mockResolvedValue(books);
        mocks.resolveBooks.mockResolvedValue(resolvedBooks);

        await expect(mocks.handlers.get('library:get-all-books')?.({})).resolves.toEqual(
            resolvedBooks,
        );
        expect(mocks.resolveBooks).toHaveBeenCalledWith(books);
    });
});
