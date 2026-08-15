import { setupIpcHandlers } from './handlers';
import { setupLibraryHandlers } from './library';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    // Initialize other IPC related modules here
}
