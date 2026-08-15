import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'crypto';

import {
    type ChatDetachedWindowClosedEvent,
    type ChatDetachedWindowOpenRequest,
    type ChatDetachedWindowSession,
} from '../../shared/models/chat-window.model';
import { DetachedWindowManager } from './detached-window-manager';

type ChatWindowManagerConfig = {
    preloadPath: string;
    iconPath: string;
    applyShortcuts: (window: BrowserWindow) => void;
    loadRoute: (window: BrowserWindow, route: string) => void;
};

/**
 * Chat-specific wrapper around detached Electron windows.
 * A book can have one detached chat window at a time.
 */
export class ChatWindowManager {
    private readonly detachedWindows: DetachedWindowManager<ChatDetachedWindowSession>;

    constructor(config: ChatWindowManagerConfig) {
        this.detachedWindows = new DetachedWindowManager<ChatDetachedWindowSession>({
            routePrefix: 'chat-detached',
            applyShortcuts: config.applyShortcuts,
            loadRoute: config.loadRoute,
            windowOptions: {
                width: 880,
                height: 720,
                minWidth: 620,
                minHeight: 520,
                skipTaskbar: false,
                title: 'Chat',
                icon: config.iconPath,
                webPreferences: {
                    preload: config.preloadPath,
                },
            },
        });
    }

    setupIpcHandlers(): void {
        ipcMain.handle('chat-window:open', async (_, request: ChatDetachedWindowOpenRequest) => {
            return { sessionId: this.open(request) };
        });

        ipcMain.handle('chat-window:get-session', async (_, { sessionId }: { sessionId: string }) => {
            return this.detachedWindows.getSession(sessionId);
        });
    }

    private open(request: ChatDetachedWindowOpenRequest): string {
        const existingSessionId = this.findSessionIdForBook(request.bookId);
        if (existingSessionId && this.detachedWindows.focus(existingSessionId)) {
            this.detachedWindows.updateSession(existingSessionId, session => ({
                ...session,
                selectedThreadId: request.selectedThreadId,
            }));
            return existingSessionId;
        }

        const sessionId = randomUUID();
        const session = {
            ...request,
            sessionId,
        };
        const window = this.detachedWindows.create(session);
        window.on('closed', () => this.notifyWindowClosed({
            bookId: session.bookId,
            sessionId: session.sessionId,
        }));

        return sessionId;
    }

    private findSessionIdForBook(bookId: string): string | null {
        return this.detachedWindows.findSession(session => session.bookId === bookId);
    }

    private notifyWindowClosed(event: ChatDetachedWindowClosedEvent): void {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send('chat-window:closed', event);
            }
        }
    }
}
