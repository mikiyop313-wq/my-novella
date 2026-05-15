import { ipcMain } from 'electron';
import { bookRepository } from '../../db/repositories/book.repository';

export function setupLibraryHandlers() {
    ipcMain.handle('library:get-all-books', async () => {
        try {
            return await bookRepository.getAll();
        } catch (error) {
            console.error('Error fetching books:', error);
            throw error;
        }
    });

    ipcMain.handle('library:add-book', async (event, bookData) => {
        try {
            return await bookRepository.add(bookData);
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
            return await bookRepository.delete(id);
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
