export { }; // Make this file a module to augment global scope

// This tells TypeScript that the global 'window' object 
// has a property called 'electronAPI' with these specific methods.
interface IElectronAPI {
    sendCloseReady: () => void;
    onBeforeClose: (callback: () => void) => void;
    sendMessage: (channel: string, data?: any) => void;
    onMessage: (channel: string, callback: (...args: any[]) => void) => () => void;
    invoke: (channel: string, data?: any) => Promise<any>;
    getAppVersion: () => string;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}