import { Injectable, inject } from '@angular/core';
import { ToastService } from '../../shared/services/toast.service';

export type AiChatMessageRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
    role: AiChatMessageRole;
    content: string;
}

@Injectable({ providedIn: 'root' })
export class AIStateService {
    model: string = '';
    toastService = inject(ToastService);

    /**
     * Signals the main process to abort the current AI generation.
     * The in-flight fetch will be cancelled and `ai:generate-aborted` will be sent back.
     */
    abort(): Promise<void> {
        return window.electronAPI.abortAiGeneration?.() ?? Promise.resolve();
    }

    async generate(
        promptText: string,
        model?: string,
        modelId?: string,
        reasoningMode?: boolean,
        messages?: AiChatMessage[],
    ) {
        // Default to openai if the user hasn't selected one yet
        const providerToUse = model || this.model || 'openrouter';

        try {
            const response = await window.electronAPI.invoke('ai:generate', {
                model: providerToUse,
                modelId: modelId,
                prompt: promptText,
                reasoningMode: reasoningMode ?? false,
                ...(messages !== undefined ? { messages } : {}),
            });

            return response.text;
        } catch (e) {
            console.error("Failed to generate text:", e);
            if (e instanceof Error) {
                if (e.message.includes('429')) {
                    this.toastService.warning('The model is temporarily rate-limited. Please retry shortly.');
                } else if (e.message.includes('401')) {
                    this.toastService.error('Invalid API Key. Please check your OpenRouter key in Settings.');
                } else if (e.message.includes('402')) {
                    this.toastService.error('Insufficient OpenRouter credits.');
                } else if (e.message.includes('400')) {
                    this.toastService.warning('Request failed. The prompt might be too long for this model.');
                } else if (e.message.includes('502') || e.message.includes('503') || e.message.includes('500')) {
                    this.toastService.warning('The AI provider is currently experiencing downtime. Try another model.');
                } else {
                    this.toastService.error('An unexpected error occurred while generating content.');
                }
            }
            throw e; // Rethrow so the caller can clean up the UI
        }
    }
}
