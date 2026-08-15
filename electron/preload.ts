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

    // Example: Get app version
    getAppVersion: () => process.versions.chrome
});

