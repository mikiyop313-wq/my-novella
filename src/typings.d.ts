export {}; // Make this file a module to augment global scope

// This tells TypeScript that the global 'window' object 
// has a property called 'electronAPI' with these specific methods.
interface IElectronAPI {
    sendMessage: (channel: string, data: any) => void;
    onMessage: (channel: string, callback: (...args: any[]) => void) => void;
    getAppVersion: () => string;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}