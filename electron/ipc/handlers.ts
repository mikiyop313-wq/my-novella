import { ipcMain } from 'electron';

export function setupIpcHandlers() {
    // Keep your ipcMain.on and ipcMain.handle logic here
    ipcMain.on('message', (event, arg) => {
        console.log('Received message from renderer:', arg);
        event.reply('reply', 'pong');

    });
}
