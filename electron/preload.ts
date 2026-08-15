import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // Send data to Main process
    sendMessage: (channel: string, data?: any) => ipcRenderer.send(channel, data),

    // Invoke a method in Main process and wait for result
    invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),

    // Receive data from Main process
    onMessage: (channel: string, callback: (...args: any[]) => void) => {
        const subscription = (event: any, ...args: any[]) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => {
            ipcRenderer.removeListener(channel, subscription);
        };
    },

    // Graceful close: listen for the close signal from main process
    onBeforeClose: (callback: () => void) => {
        ipcRenderer.on('app:before-close', () => callback());
    },

    // Signal to main process that flushing is complete and it's safe to close
    sendCloseReady: () => ipcRenderer.send('app:close-ready'),

    // Example: Get app version
    getAppVersion: () => process.versions.chrome,

    // Abort an in-flight AI generation
    abortAiGeneration: () => ipcRenderer.invoke('ai:abort'),

    // Receive notification that generation was aborted cleanly
    onGenerationAborted: (callback: () => void) => {
        const subscription = () => callback();
        ipcRenderer.on('ai:generate-aborted', subscription);
        return () => ipcRenderer.removeListener('ai:generate-aborted', subscription);
    }
});

