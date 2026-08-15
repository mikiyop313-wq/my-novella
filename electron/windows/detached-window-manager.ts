import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

export type DetachedWindowSession = {
    sessionId: string;
};

type DetachedWindowManagerConfig = {
    routePrefix: string;
    windowOptions: BrowserWindowConstructorOptions;
    applyShortcuts: (window: BrowserWindow) => void;
    loadRoute: (window: BrowserWindow, route: string) => void;
};

/**
 * Generic lifecycle manager for Electron child windows that are loaded by session id.
 * Feature-specific managers should keep their own IPC/domain rules and delegate
 * window creation, focusing, lookup, and cleanup to this class.
 */
export class DetachedWindowManager<TSession extends DetachedWindowSession> {
    // Session metadata and BrowserWindow instances share the same sessionId key.
    private readonly sessions = new Map<string, TSession>();
    private readonly windows = new Map<string, BrowserWindow>();

    constructor(private readonly config: DetachedWindowManagerConfig) {}

    /**
     * Creates a new detached window, stores its session, and loads the configured route.
     */
    create(session: TSession): BrowserWindow {
        const child = new BrowserWindow({
            ...this.config.windowOptions,
            webPreferences: {
                ...this.config.windowOptions.webPreferences,
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        child.setMenuBarVisibility(false);
        this.config.applyShortcuts(child);
        this.config.loadRoute(child, `${this.config.routePrefix}/${session.sessionId}`);

        child.on('closed', () => {
            // Keep stale window/session references from surviving after the user closes the child window.
            this.windows.delete(session.sessionId);
            this.sessions.delete(session.sessionId);
        });

        this.sessions.set(session.sessionId, session);
        this.windows.set(session.sessionId, child);

        return child;
    }

    getSession(sessionId: string): TSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    /**
     * Replaces session metadata without touching the BrowserWindow instance.
     */
    updateSession(sessionId: string, updater: (session: TSession) => TSession): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.sessions.set(sessionId, updater(session));
        }
    }

    /**
     * Brings an existing detached window to the front when it is still alive.
     */
    focus(sessionId: string): boolean {
        const window = this.windows.get(sessionId);
        if (!window || window.isDestroyed()) return false;

        if (window.isMinimized()) {
            window.restore();
        }

        window.show();
        window.focus();
        return true;
    }

    /**
     * Finds a live session by feature-specific criteria, such as a Codex entry id.
     */
    findSession(predicate: (session: TSession) => boolean): string | null {
        for (const [sessionId, session] of this.sessions) {
            if (predicate(session) && this.windows.has(sessionId)) {
                return sessionId;
            }
        }

        return null;
    }

    /**
     * Maps an IPC sender back to the detached window session that produced it.
     */
    findSessionByWebContents(webContentsId: number): string | null {
        for (const [sessionId, window] of this.windows) {
            if (window.webContents.id === webContentsId) {
                return sessionId;
            }
        }

        return null;
    }
}
