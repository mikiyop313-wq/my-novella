import { ipcMain } from 'electron';
import type {
    AbortAiGenerationRequest,
    AiGenerationAbortedEvent,
    AiStreamEvent,
    LoadAiApiKeyRequest,
    SaveAiApiKeyRequest,
    SaveAiServerUrlRequest,
    TestAiProviderConnectionRequest,
} from '../../../shared/models/ai.model';
import { aiConfigurationService } from '../../domain/ai/ai-configuration.service';
import { aiService } from '../../domain/ai/ai.service';
import type { AiPromptRequest } from '../../domain/ai/models';

interface AiGenerateIpcRequest extends Omit<
    AiPromptRequest,
    'abortSignal' | 'onToken' | 'onReasoningToken'
> {
    streamId: string;
}

interface AiGenerateIpcResponse {
    text: string;
    modelUsed: string;
    aborted?: true;
}

const abortControllersBySender = new Map<number, Map<string, AbortController>>();

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

    ipcMain.handle(
        'ai:config:test-connection',
        async (_event, request: TestAiProviderConnectionRequest) => {
            if (!request || typeof request.providerId !== 'string') {
                throw new Error('Invalid AI provider connection test request.');
            }

            return aiService.testConnection(request.providerId);
        },
    );

    ipcMain.handle('ai:generate', async (event, request: AiGenerateIpcRequest) => {
        if (!request || typeof request.streamId !== 'string' || !request.streamId) {
            throw new Error('Invalid AI generation stream ID.');
        }

        const senderId = event.sender.id;
        const senderControllers = getSenderAbortControllers(senderId);
        if (senderControllers.has(request.streamId)) {
            throw new Error(`AI generation stream "${request.streamId}" is already active.`);
        }

        const abortController = new AbortController();
        senderControllers.set(request.streamId, abortController);
        const { streamId, ...providerRequest } = request;

        try {
            const requestWithCallback: AiPromptRequest = {
                ...providerRequest,
                abortSignal: abortController.signal,
                onToken: (token: string) => {
                    const payload: AiStreamEvent = { streamId, token };
                    event.sender.send('ai:generate-stream', payload);
                },
                onReasoningToken: (token: string) => {
                    const payload: AiStreamEvent = { streamId, token };
                    event.sender.send('ai:generate-reasoning-stream', payload);
                }
            };
            return await aiService.generatePrompt(requestWithCallback);
        } catch (error: any) {
            // Distinguish a user-requested abort from an actual error
            if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
                const payload: AiGenerationAbortedEvent = { streamId };
                event.sender.send('ai:generate-aborted', payload);
                const response: AiGenerateIpcResponse = {
                    text: '',
                    modelUsed: request.modelId || '',
                    aborted: true,
                };
                return response;
            }
            console.error('Error in ai:generate IPC handler:', error);
            // Throw error so it gets rejected in the renderer process
            throw error;
        } finally {
            if (senderControllers.get(streamId) === abortController) {
                senderControllers.delete(streamId);
            }
            if (senderControllers.size === 0) abortControllersBySender.delete(senderId);
        }
    });

    ipcMain.handle('ai:abort', async (event, request: AbortAiGenerationRequest) => {
        if (!request || typeof request.streamId !== 'string' || !request.streamId) {
            throw new Error('Invalid AI generation abort request.');
        }

        abortControllersBySender.get(event.sender.id)?.get(request.streamId)?.abort();
    });

    ipcMain.handle('ai:list-models', () => aiService.listModels());
}

function getSenderAbortControllers(senderId: number): Map<string, AbortController> {
    const existingControllers = abortControllersBySender.get(senderId);
    if (existingControllers) return existingControllers;

    const controllers = new Map<string, AbortController>();
    abortControllersBySender.set(senderId, controllers);
    return controllers;
}
