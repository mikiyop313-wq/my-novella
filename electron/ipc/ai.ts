import { ipcMain } from 'electron';
import { aiService } from '../domain/ai/ai.service';
import { AiPromptRequest } from '../domain/ai/models';

export function setupAiHandlers() {
    ipcMain.handle('ai:generate', async (event, request: AiPromptRequest) => {
        try {
            return await aiService.generatePrompt(request);
        } catch (error) {
            console.error('Error in ai:generate IPC handler:', error);
            // Throw error so it gets rejected in the renderer process
            throw error;
        }
    });
}
