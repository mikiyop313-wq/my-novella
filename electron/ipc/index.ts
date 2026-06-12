import { setupIpcHandlers } from './core/handlers';
import { setupLibraryHandlers } from './library/library';
import { setupAiHandlers } from './ai/ai';
import { setupCodexHandlers } from './codex/codex';
import { setupManuscriptHandlers } from './library/manuscript';
import { setupVectorHandlers } from './library/paragraph-vectors';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    setupCodexHandlers();
    setupManuscriptHandlers();
    setupVectorHandlers();

    try {
        console.log('IPC handlers initialized');
    } catch (error) {
        console.error('Error initializing IPC handlers:', error);
    }
}
