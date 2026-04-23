import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { initializeIpc } from './ipc';
import '../db/index';

let win: BrowserWindow | null;

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

    win.on('closed', () => {
        win = null;
    });
}


app.on('ready', () => {
    initializeIpc();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
