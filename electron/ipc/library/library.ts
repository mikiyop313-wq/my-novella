import { ipcMain } from 'electron';
import { bookRepository } from '../../../db/repositories/book.repository';
import type { CreateBookDto } from '../../../shared/models/book.model';
import { embeddingSelectionResolverService } from '../../../vectors/services/embedding-selection-resolver.service';
import { manuscriptVectorIndexService } from '../../../vectors/services/manuscript-vector-index.service';

export function setupLibraryHandlers() {
    ipcMain.handle('library:get-all-books', async () => {
        try {
            const books = await bookRepository.getAll();
            return await embeddingSelectionResolverService.resolveBooks(books);
        } catch (error) {
            console.error('Error fetching books:', error);
            throw error;
        }
    });

    ipcMain.handle('library:add-book', async (event, bookData: CreateBookDto) => {
        try {
            const selection = bookData.settings?.embeddingModel === undefined
                ? await embeddingSelectionResolverService.resolveForNewBook()
                : null;
            return await bookRepository.add(selection ? {
                ...bookData,
                settings: {
                    language: bookData.settings?.language ?? bookData.language,
                    proseTense: bookData.settings?.proseTense ?? 'past',
                    pointOfView: bookData.settings?.pointOfView ?? 'third_limited',
                    synopsisAiContext: bookData.settings?.synopsisAiContext
                        ?? Boolean(bookData.synopsis?.trim()),
                    ...bookData.settings,
                    ...selection,
                },
            } : bookData);
        } catch (error) {
            console.error('Error adding book:', error);
            throw error;
        }
    });

    ipcMain.handle('library:update-book', async (event, { id, data }) => {
        try {
            return await bookRepository.update(id, data);
        } catch (error) {
            console.error('Error updating book:', error);
            throw error;
        }
    });

    ipcMain.handle('library:delete-book', async (event, id) => {
        try {
            return await manuscriptVectorIndexService.deleteBook(id);
        } catch (error) {
            console.error('Error deleting book:', error);
            throw error;
        }
    });

    ipcMain.handle('library:get-languages', async () => {
        try {
            return await bookRepository.getLanguages();
        } catch (error) {
            console.error('Error fetching languages:', error);
            throw error;
        }
    });

    ipcMain.handle('library:get-genres', async () => {
        try {
            return await bookRepository.getGenres();
        } catch (error) {
            console.error('Error fetching genres:', error);
            throw error;
        }
    });

    ipcMain.handle('library:get-tropes', async () => {
        try {
            return await bookRepository.getTropes();
        } catch (error) {
            console.error('Error fetching genres:', error);
            throw error;
        }
    });

}
