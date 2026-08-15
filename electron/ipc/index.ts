import { setupIpcHandlers } from './handlers';
import { setupLibraryHandlers } from './library';
import { setupAiHandlers } from './ai';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    // Initialize other IPC related modules here

    try {
        console.log('IPC handlers initialized');
    } catch (error) {
        console.error('Error initializing IPC handlers:', error);
    }
}
