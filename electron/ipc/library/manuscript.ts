import { ipcMain } from 'electron';
import { manuscriptRepository } from '../../../db/repositories/manuscript.repository';

export function setupManuscriptHandlers() {
    ipcMain.handle('manuscript:get', async (_, { mode, id }: { mode: 'book' | 'act' | 'chapter' | 'scene', id: string }) => {
        try {
            return await manuscriptRepository.getManuscript(mode, id);
        } catch (error) {
            console.error('Failed to get manuscript:', error);
            throw error;
        }
    });
}
