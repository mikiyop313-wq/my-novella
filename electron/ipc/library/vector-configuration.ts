import { ipcMain } from 'electron';

import type {
    LoadVectorApiKeyRequest,
    SaveVectorApiKeyRequest,
    TestVectorProviderConnectionRequest,
} from '../../../shared/models/vector.model';
import { vectorConfigurationService } from '../../domain/vector/vector-configuration.service';

export function setupVectorConfigurationHandlers(): void {
    ipcMain.handle('vectors:config:load', () => vectorConfigurationService.loadConfiguration());

    ipcMain.handle(
        'vectors:config:load-api-key',
        (_event, request: LoadVectorApiKeyRequest) => {
            if (!request || typeof request.providerId !== 'string') {
                throw new Error('Invalid vector API key load request.');
            }
            return vectorConfigurationService.loadApiKey(request.providerId);
        },
    );

    ipcMain.handle(
        'vectors:config:save-api-key',
        (_event, request: SaveVectorApiKeyRequest) => {
            if (
                !request
                || typeof request.providerId !== 'string'
                || typeof request.apiKey !== 'string'
            ) {
                throw new Error('Invalid vector API key configuration request.');
            }
            return vectorConfigurationService.saveApiKey(request.providerId, request.apiKey);
        },
    );

    ipcMain.handle(
        'vectors:config:test-connection',
        async (_event, request: TestVectorProviderConnectionRequest) => {
            if (!request || typeof request.providerId !== 'string') {
                throw new Error('Invalid vector provider connection test request.');
            }
            await vectorConfigurationService.testConnection(request.providerId);
        },
    );
}
