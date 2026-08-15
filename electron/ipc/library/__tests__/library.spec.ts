import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => unknown>(),
    deleteBook: vi.fn(),
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
        getAll: vi.fn(),
        add: vi.fn(),
        update: vi.fn(),
        getLanguages: vi.fn(),
        getGenres: vi.fn(),
        getTropes: vi.fn(),
    },
}));

vi.mock('../../../../vectors/services/manuscript-vector-index.service', () => ({
    manuscriptVectorIndexService: { deleteBook: mocks.deleteBook },
}));

import { setupLibraryHandlers } from '../library';

describe('library IPC handlers', () => {
    beforeEach(() => {
        mocks.handlers.clear();
        vi.clearAllMocks();
        mocks.deleteBook.mockResolvedValue({ success: true });
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
});
