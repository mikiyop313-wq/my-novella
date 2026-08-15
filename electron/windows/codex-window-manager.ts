import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import {
    type CodexDetachedEntryChangedEvent,
    type CodexDetachedWindowOpenRequest,
    type CodexDetachedWindowSession,
} from '../../shared/models/codex-window.model';
import { DetachedWindowManager } from './detached-window-manager';

type CodexWindowManagerConfig = {
    preloadPath: string;
    iconPath: string;
    applyShortcuts: (window: BrowserWindow) => void;
    loadRoute: (window: BrowserWindow, route: string) => void;
};

/**
 * Codex-specific wrapper around the generic detached window manager.
 * It owns the Codex IPC channels and the rule that a saved entry should only
 * have one detached window open at a time.
 */
export class CodexWindowManager {
    private readonly detachedWindows: DetachedWindowManager<CodexDetachedWindowSession>;

    constructor(config: CodexWindowManagerConfig) {
        this.detachedWindows = new DetachedWindowManager<CodexDetachedWindowSession>({
            routePrefix: 'codex-detached',
            applyShortcuts: config.applyShortcuts,
            loadRoute: config.loadRoute,
            windowOptions: {
                width: 620,
                height: 760,
                minWidth: 520,
                minHeight: 560,
                skipTaskbar: false,
                title: 'Codex Entry',
                icon: config.iconPath,
                webPreferences: {
                    preload: config.preloadPath,
                },
            },
        });
    }

    /**
     * Registers the IPC surface used by CodexWindowService in the Angular renderer.
     */
    setupIpcHandlers(): void {
        ipcMain.handle('codex-window:open', async (_, request: CodexDetachedWindowOpenRequest) => {
            return { sessionId: this.open(request) };
        });

        ipcMain.handle('codex-window:get-session', async (_, { sessionId }: { sessionId: string }) => {
            return this.detachedWindows.getSession(sessionId);
        });

        ipcMain.handle('codex-window:focus-entry', async (_, { entryId }: { entryId: string }) => {
            return this.focusEntry(entryId);
        });

        ipcMain.on('codex-window:entry-changed', (event, payload: CodexDetachedEntryChangedEvent) => {
            this.handleEntryChanged(event.sender.id, payload);
        });
    }

    /**
     * Opens a new Codex detached window, or focuses the existing one for the same entry.
     */
    private open(request: CodexDetachedWindowOpenRequest): string {
        if (request.entryId) {
            const existingSessionId = this.findSessionIdForEntry(request.entryId);
            if (existingSessionId && this.detachedWindows.focus(existingSessionId)) {
                return existingSessionId;
            }
        }

        const sessionId = randomUUID();
        this.detachedWindows.create({
            ...request,
            sessionId,
        });

        return sessionId;
    }

    /**
     * Lets the main Codex sidebar focus an already-detached entry instead of selecting it inline.
     */
    private focusEntry(entryId: string): boolean {
        const sessionId = this.findSessionIdForEntry(entryId);
        return sessionId ? this.detachedWindows.focus(sessionId) : false;
    }

    private findSessionIdForEntry(entryId: string): string | null {
        return this.detachedWindows.findSession(session => session.entryId === entryId);
    }

    /**
     * Keeps the sender session fresh and notifies every other window that Codex data changed.
     */
    private handleEntryChanged(senderWebContentsId: number, payload: CodexDetachedEntryChangedEvent): void {
        const senderSessionId = this.detachedWindows.findSessionByWebContents(senderWebContentsId);
        if (senderSessionId && payload.entryId) {
            // A draft detached window receives an entryId only after the entry is first saved.
            this.detachedWindows.updateSession(senderSessionId, session => ({
                ...session,
                entryId: payload.entryId,
                initialType: payload.type,
            }));
        }

        for (const window of BrowserWindow.getAllWindows()) {
            if (window.webContents.id !== senderWebContentsId) {
                window.webContents.send('codex-window:entry-changed', payload);
            }
        }
    }
}
