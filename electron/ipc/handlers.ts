import { ipcMain } from 'electron';

export function setupIpcHandlers() {
    // Message handler
    ipcMain.on('message', (event, arg) => {
        console.log('Received message from renderer:', arg);
        event.reply('reply', 'pong');
    });
}
