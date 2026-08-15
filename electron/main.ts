import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeIpc } from './ipc';
import { ChatWindowManager } from './windows/chat-window-manager';
import { CodexWindowManager } from './windows/codex-window-manager';
import { localEmbeddingModelManager } from '../vectors/embeddings/local-model-manager';
import '../db/index';

if (!app.isPackaged) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

let win: BrowserWindow | null;
let isReadyToClose = false;
const appIconPath = path.join(app.getAppPath(), 'public', 'app-icon.ico');

function isDevMode(): boolean {
    return process.env.NODE_ENV === 'development';
}

function applyWindowShortcuts(window: BrowserWindow) {
    window.webContents.on('before-input-event', (_event, input) => {
        const wc = window.webContents;

        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools();
        }

        if (input.key === 'F5' || (input.control && input.key === 'r')) {
            wc.reload();
        }
    });
}

function loadAppRoute(window: BrowserWindow, route = '') {
    const normalizedRoute = route.replace(/^\/+/, '');

    if (isDevMode()) {
        const hash = normalizedRoute ? `#/${normalizedRoute}` : '';
        window.loadURL(`http://localhost:4200/${hash}`);
        return;
    }

    const indexPath = path.join(__dirname, '../dist/my-novella/browser/index.html');
    if (normalizedRoute) {
        window.loadFile(indexPath, { hash: `/${normalizedRoute}` });
        return;
    }

    window.loadFile(indexPath);
}

function setupCodexWindowHandlers() {
    const codexWindowManager = new CodexWindowManager({
        preloadPath: path.join(__dirname, 'preload.js'),
        iconPath: appIconPath,
        applyShortcuts: applyWindowShortcuts,
        loadRoute: loadAppRoute,
    });
    codexWindowManager.setupIpcHandlers();
}

function setupChatWindowHandlers() {
    const chatWindowManager = new ChatWindowManager({
        preloadPath: path.join(__dirname, 'preload.js'),
        iconPath: appIconPath,
        applyShortcuts: applyWindowShortcuts,
        loadRoute: loadAppRoute,
    });
    chatWindowManager.setupIpcHandlers();
}

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: appIconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true, // Note: For production, use a preload script instead
            preload: path.join(__dirname, 'preload.js')
        }
    });

    loadAppRoute(win);
    if (isDevMode()) {
        win.webContents.openDevTools();
    }

    // ── Graceful close: let the renderer flush unsaved data ──────────────
    win.on('close', (e) => {
        if (!isReadyToClose && win) {
            e.preventDefault();
            win.webContents.send('app:before-close');

            // Safety timeout — if the renderer doesn't respond in 3 s, close anyway.
            setTimeout(() => {
                isReadyToClose = true;
                win?.close();
            }, 3000);
        }
    });

    // ── Instant keyboard shortcuts (bypass slow native menu bar) ─────────
    win.webContents.on('before-input-event', (_event, input) => {
        if (!win) return;
        const wc = win.webContents;

        // F12 or Ctrl+Shift+I → toggle DevTools
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools();
        }

        // F5 or Ctrl+R → reload
        if (input.key === 'F5' || (input.control && input.key === 'r')) {
            wc.reload();
        }
    });

    win.on('closed', () => {
        win = null;
    });
}

// Renderer signals that flushing is done; allow the window to close.
ipcMain.on('app:close-ready', () => {
    isReadyToClose = true;
    win?.close();
});

app.on('ready', async () => {
    initializeIpc();
    setupCodexWindowHandlers();
    setupChatWindowHandlers();
    await localEmbeddingModelManager.cleanupIncompleteDownloads();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
