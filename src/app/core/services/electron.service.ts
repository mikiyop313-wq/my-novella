import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ElectronService {
    private beforeCloseHandlers: (() => Promise<void> | void)[] = [];

    constructor() { 
        if (window.electronAPI?.onBeforeClose) {
            window.electronAPI.onBeforeClose(async () => {
                for (const handler of this.beforeCloseHandlers) {
                    try {
                        await handler();
                    } catch (e) {
                        console.error('Error in beforeCloseHandler', e);
                    }
                }
                this.sendCloseReady();
            });
        }
    }

    // Use this to send data to the Main process
    send(channel: string, data?: any): void {
        if (window.electronAPI) {
            window.electronAPI.sendMessage(channel, data);
        }
    }

    // Use this to listen for replies from the Main process
    on(channel: string, callback: (...args: any[]) => void): () => void {
        if (window.electronAPI) {
            return window.electronAPI.onMessage(channel, callback);
        }
        return () => {};
    }

    // Use this to invoke a method in the Main process and wait for a result
    async invoke(channel: string, data?: any): Promise<any> {
        if (window.electronAPI) {
            return await window.electronAPI.invoke(channel, data);
        }
        return Promise.reject('Electron API not available');
    }

    onBeforeClose(callback: () => Promise<void> | void): void {
        this.beforeCloseHandlers.push(callback);
    }

    removeBeforeCloseHandler(callback: () => Promise<void> | void): void {
        this.beforeCloseHandlers = this.beforeCloseHandlers.filter(h => h !== callback);
    }

    sendCloseReady(): void {
        if (window.electronAPI?.sendCloseReady) {
            window.electronAPI.sendCloseReady();
        }
    }
}
