import { ipcMain } from 'electron';
import { manuscriptRepository } from '../../../db/repositories/manuscript.repository';
import {
    CreateActPayload, CreateChapterPayload, CreateScenePayload,
    DeleteActPayload, DeleteChapterPayload, DeleteScenePayload,
    UpdateActPayload, UpdateChapterPayload, UpdateScenePayload
} from '../../../shared/models/manuscript.model';

export function setupManuscriptHandlers() {
    ipcMain.handle('manuscript:get', async (_, { mode, id }: { mode: 'book' | 'act' | 'chapter' | 'scene', id: string }) => {
        try {
            return await manuscriptRepository.getManuscript(mode, id);
        } catch (error) {
            console.error('Failed to get manuscript:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:createAct', async (_, { bookId }: CreateActPayload) => {
        try {
            return await manuscriptRepository.createAct(bookId);
        } catch (error) {
            console.error('Failed to create act:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:createChapter', async (_, { actId }: CreateChapterPayload) => {
        try {
            return await manuscriptRepository.createChapter(actId);
        } catch (error) {
            console.error('Failed to create chapter:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:createScene', async (_, { chapterId }: CreateScenePayload) => {
        try {
            return await manuscriptRepository.createScene(chapterId);
        } catch (error) {
            console.error('Failed to create scene:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:updateAct', async (_, payload: UpdateActPayload) => {
        try {
            return await manuscriptRepository.updateAct(payload);
        } catch (error) {
            console.error('Failed to update act:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:updateChapter', async (_, payload: UpdateChapterPayload) => {
        try {
            return await manuscriptRepository.updateChapter(payload);
        } catch (error) {
            console.error('Failed to update chapter:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:updateScene', async (_, payload: UpdateScenePayload) => {
        try {
            return await manuscriptRepository.updateScene(payload);
        } catch (error) {
            console.error('Failed to update scene:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:deleteAct', async (_, { id }: DeleteActPayload) => {
        try {
            await manuscriptRepository.deleteAct(id);
        } catch (error) {
            console.error('Failed to delete act:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:deleteChapter', async (_, { id }: DeleteChapterPayload) => {
        try {
            await manuscriptRepository.deleteChapter(id);
        } catch (error) {
            console.error('Failed to delete chapter:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:deleteScene', async (_, { id }: DeleteScenePayload) => {
        try {
            await manuscriptRepository.deleteScene(id);
        } catch (error) {
            console.error('Failed to delete scene:', error);
            throw error;
        }
    });
}
