import { ipcMain } from 'electron';
import { archivedManuscriptRepository } from '../../../db/repositories/archived-manuscript.repository';
import { manuscriptRepository } from '../../../db/repositories/manuscript.repository';
import {
    ArchiveActPayload, ArchiveChapterPayload, ArchiveScenePayload,
    CreateActPayload, CreateChapterPayload, CreateScenePayload,
    DeleteActPayload, DeleteChapterPayload, DeleteScenePayload,
    GetArchiveOverviewPayload,
    RestoreActPayload, RestoreChapterPayload, RestoreScenePayload,
    UpdateActPayload, UpdateChapterPayload, UpdateScenePayload,
    UpdateStructurePositionsPayload
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

    ipcMain.handle('manuscript:getOutline', async (_, { bookId }: { bookId: string }) => {
        try {
            return await manuscriptRepository.getOutline(bookId);
        } catch (error) {
            console.error('Failed to get outline:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:getArchiveOverview', async (_, { bookId }: GetArchiveOverviewPayload) => {
        try {
            return await archivedManuscriptRepository.getArchiveOverview(bookId);
        } catch (error) {
            console.error('Failed to get archive overview:', error);
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

    ipcMain.handle('manuscript:updateStructurePositions', async (_, payload: UpdateStructurePositionsPayload) => {
        try {
            await manuscriptRepository.updateStructurePositions(payload);
        } catch (error) {
            console.error('Failed to update structure positions:', error);
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

    ipcMain.handle('manuscript:archiveAct', async (_, { id }: ArchiveActPayload) => {
        try {
            await archivedManuscriptRepository.archiveAct(id);
        } catch (error) {
            console.error('Failed to archive act:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:archiveChapter', async (_, { id }: ArchiveChapterPayload) => {
        try {
            await archivedManuscriptRepository.archiveChapter(id);
        } catch (error) {
            console.error('Failed to archive chapter:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:archiveScene', async (_, { id }: ArchiveScenePayload) => {
        try {
            await archivedManuscriptRepository.archiveScene(id);
        } catch (error) {
            console.error('Failed to archive scene:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:restoreAct', async (_, { id }: RestoreActPayload) => {
        try {
            await archivedManuscriptRepository.restoreAct(id);
        } catch (error) {
            console.error('Failed to restore act:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:restoreChapter', async (_, { id, targetActId }: RestoreChapterPayload) => {
        try {
            await archivedManuscriptRepository.restoreChapter(id, targetActId);
        } catch (error) {
            console.error('Failed to restore chapter:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:restoreScene', async (_, { id, targetChapterId }: RestoreScenePayload) => {
        try {
            await archivedManuscriptRepository.restoreScene(id, targetChapterId);
        } catch (error) {
            console.error('Failed to restore scene:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:getWordCount', async (_, { mode, id }: { mode: 'book' | 'act' | 'chapter' | 'scene', id: string }) => {
        try {
            return await manuscriptRepository.getWordCount(mode, id);
        } catch (error) {
            console.error('Failed to get word count:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:getChapterCount', async (_, { bookId }: { bookId: string }) => {
        try {
            return await manuscriptRepository.getChapterCount(bookId);
        } catch (error) {
            console.error('Failed to get chapter count:', error);
            throw error;
        }
    });

    ipcMain.handle('manuscript:getScenesProse', async (_, { sceneIds }: { sceneIds: string[] }) => {
        try {
            return await manuscriptRepository.getScenesProse(sceneIds);
        } catch (error) {
            console.error('Failed to get scenes prose:', error);
            throw error;
        }
    });
    ipcMain.handle('manuscript:getBookHierarchy', async (_, { mode, id }: { mode: 'book' | 'act' | 'chapter' | 'scene', id: string }) => {
        try {
            return await manuscriptRepository.getBookHierarchy(mode, id);
        } catch (error) {
            console.error('Failed to get book hierarchy:', error);
            throw error;
        }
    });
}
