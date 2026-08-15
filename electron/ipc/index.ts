import { setupIpcHandlers } from './core/handlers';
import { setupLibraryHandlers } from './library/library';
import { setupAiHandlers } from './ai/ai';
import { setupChatHandlers } from './chat/chat';
import { setupCodexHandlers } from './codex/codex';
import { setupManuscriptHandlers } from './library/manuscript';
import { setupVectorHandlers } from './library/paragraph-vectors';
import { setupSystemPromptHandlers } from './system-prompt/system-prompt';

export function initializeIpc() {
    setupIpcHandlers();
    setupLibraryHandlers();
    setupAiHandlers();
    setupChatHandlers();
    setupCodexHandlers();
    setupManuscriptHandlers();
    setupVectorHandlers();
    setupSystemPromptHandlers();

    try {
        console.log('IPC handlers initialized');
    } catch (error) {
        console.error('Error initializing IPC handlers:', error);
    }
}
