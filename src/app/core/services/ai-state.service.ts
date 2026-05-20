import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AIStateService {
    model: string = '';

    async generate(promptText: string, onToken?: (token: string) => void) {
        // Default to openai if the user hasn't selected one yet
        const modelToUse = this.model || 'openrouter';

        let cleanup: (() => void) | undefined;
        if (onToken && window.electronAPI.onMessage) {
            cleanup = window.electronAPI.onMessage('ai:generate-stream', (token: string) => {
                onToken(token);
            });
        }

        try {
            const response = await window.electronAPI.invoke('ai:generate', {
                model: modelToUse,
                prompt: promptText
            });
            
            if (cleanup) cleanup();
            return response.text;
        } catch (e) {
            if (cleanup) cleanup();
            console.error("Failed to generate text:", e);
            return "Error generating content. Check if your API key is set correctly in Settings.";
        }
    }
}