import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeIpc } from './ipc';
import '../db/index';

if (!app.isPackaged) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

let win: BrowserWindow | null;
let isReadyToClose = false;

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true, // Note: For production, use a preload script instead
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        // Load Angular dev server
        win.loadURL('http://localhost:4200');
        win.webContents.openDevTools();
    } else {
        // Load built Angular app
        win.loadFile(path.join(__dirname, '../dist/my-novella/browser/index.html'));
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

    win.on('closed', () => {
        win = null;
    });
}

// Renderer signals that flushing is done; allow the window to close.
ipcMain.on('app:close-ready', () => {
    isReadyToClose = true;
    win?.close();
});

app.on('ready', () => {
    initializeIpc();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
