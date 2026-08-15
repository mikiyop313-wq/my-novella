import { ipcMain } from 'electron';
import { aiService } from '../domain/ai/ai.service';
import { AiPromptRequest } from '../domain/ai/models';

export function setupAiHandlers() {
    ipcMain.handle('ai:generate', async (event, request: AiPromptRequest) => {
        try {
            // Attach a callback to send tokens back to the renderer
            const requestWithCallback: AiPromptRequest = {
                ...request,
                onToken: (token: string) => {
                    event.sender.send('ai:generate-stream', token);
                }
            };
            return await aiService.generatePrompt(requestWithCallback);
        } catch (error) {
            console.error('Error in ai:generate IPC handler:', error);
            // Throw error so it gets rejected in the renderer process
            throw error;
        }
    });
}
