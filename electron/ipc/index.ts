import { setupIpcHandlers } from './core/handlers';
import { setupLibraryHandlers } from './library/library';
import { setupAiHandlers } from './ai/ai';
import { setupManuscriptHandlers } from './library/manuscript';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    setupManuscriptHandlers();
    // Initialize other IPC related modules here

    try {
        console.log('IPC handlers initialized');
    } catch (error) {
        console.error('Error initializing IPC handlers:', error);
    }
}
