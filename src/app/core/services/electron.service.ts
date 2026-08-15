import { Injectable } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ElectronService {
    constructor() { }

    // Use this to send data to the Main process
    send(channel: string, data: any): void {
        if (window.electronAPI) {
            window.electronAPI.sendMessage(channel, data);
        }
    }

    // Use this to listen for replies from the Main process
    on(channel: string, callback: (...args: any[]) => void): void {
        if (window.electronAPI) {
            window.electronAPI.onMessage(channel, callback);
        }
    }

    // Use this to invoke a method in the Main process and wait for a result
    async invoke(channel: string, data?: any): Promise<any> {
        if (window.electronAPI) {
            return await window.electronAPI.invoke(channel, data);
        }
        return Promise.reject('Electron API not available');
    }
}