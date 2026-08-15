/**
 * Composes and registers every Electron main-process IPC handler used by the application.
 *
 * @packageDocumentation
 */

import { setupIpcHandlers } from './core/handlers';
import { setupLibraryHandlers } from './library/library';
import { setupAiHandlers } from './ai/ai';
import { setupChatHandlers } from './chat/chat';
import { setupCodexHandlers } from './codex/codex';
import { setupManuscriptHandlers } from './library/manuscript';
import { setupVectorHandlers } from './library/paragraph-vectors';
import { setupSystemPromptHandlers } from './system-prompt/system-prompt';
import { setupLocalEmbeddingModelHandlers } from './library/local-embedding-model';
import { setupVectorConfigurationHandlers } from './library/vector-configuration';
import { setupOpenRouterEmbeddingModelHandlers } from './library/openrouter-embedding-model';
import { setupCloudEmbeddingProviderHandlers } from './library/cloud-embedding-provider';
import { setupManuscriptExportHandlers } from './manuscript-export/manuscript-export';

/** Initializes all application IPC domains once the Electron app is ready. */
export function initializeIpc(): void {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    setupChatHandlers();
    setupCodexHandlers();
    setupManuscriptHandlers();
    setupVectorHandlers();
    setupSystemPromptHandlers();
    setupLocalEmbeddingModelHandlers();
    setupVectorConfigurationHandlers();
    setupOpenRouterEmbeddingModelHandlers();
    setupCloudEmbeddingProviderHandlers();
    setupManuscriptExportHandlers();

    try {
        console.log('IPC handlers initialized');
    } catch (error) {
        console.error('Error initializing IPC handlers:', error);
    }
}
