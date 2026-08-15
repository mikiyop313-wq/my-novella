import { ipcMain } from 'electron';
import type {
    LoadAiApiKeyRequest,
    SaveAiApiKeyRequest,
    SaveAiServerUrlRequest,
} from '../../../shared/models/ai.model';
import { aiConfigurationService } from '../../domain/ai/ai-configuration.service';
import { aiService } from '../../domain/ai/ai.service';
import type { AiPromptRequest } from '../../domain/ai/models';

let currentAbortController: AbortController | null = null;

export function setupAiHandlers() {
    ipcMain.handle('ai:config:load', async () => {
        return aiConfigurationService.loadConfiguration();
    });

    ipcMain.handle(
        'ai:config:load-api-key',
        async (_event, request: LoadAiApiKeyRequest) => {
            if (!request || typeof request.providerId !== 'string') {
                throw new Error('Invalid API key load request.');
            }

            return aiConfigurationService.loadApiKey(request.providerId);
        },
    );

    ipcMain.handle(
        'ai:config:save-api-key',
        async (_event, request: SaveAiApiKeyRequest) => {
            if (!request || typeof request.providerId !== 'string' || typeof request.apiKey !== 'string') {
                throw new Error('Invalid API key configuration request.');
            }

            return aiConfigurationService.saveApiKey(request.providerId, request.apiKey);
        },
    );

    ipcMain.handle(
        'ai:config:save-server-url',
        async (_event, request: SaveAiServerUrlRequest) => {
            if (!request || typeof request.providerId !== 'string' || typeof request.serverUrl !== 'string') {
                throw new Error('Invalid server URL configuration request.');
            }

            return aiConfigurationService.saveServerUrl(request.providerId, request.serverUrl);
        },
    );

    ipcMain.handle('ai:generate', async (event, request: AiPromptRequest) => {
        // Create a fresh controller for this generation session
        currentAbortController = new AbortController();

        try {
            // Attach a callback to send tokens back to the renderer
            const requestWithCallback: AiPromptRequest = {
                ...request,
                abortSignal: currentAbortController.signal,
                onToken: (token: string) => {
                    event.sender.send('ai:generate-stream', token);
                },
                onReasoningToken: (token: string) => {
                    event.sender.send('ai:generate-reasoning-stream', token);
                }
            };
            return await aiService.generatePrompt(requestWithCallback);
        } catch (error: any) {
            // Distinguish a user-requested abort from an actual error
            if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
                // Signal the renderer that we stopped cleanly
                event.sender.send('ai:generate-aborted');
                return { text: '', modelUsed: request.modelId || '' };
            }
            console.error('Error in ai:generate IPC handler:', error);
            // Throw error so it gets rejected in the renderer process
            throw error;
        } finally {
            currentAbortController = null;
        }
    });

    ipcMain.handle('ai:abort', async () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });

    ipcMain.handle('ai:list-models', () => aiService.listModels());
}
