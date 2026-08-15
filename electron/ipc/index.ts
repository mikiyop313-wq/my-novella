import { setupIpcHandlers } from './handlers';
import { setupLibraryHandlers } from './library';
import { setupAiHandlers } from './ai';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    // Initialize other IPC related modules here
}
