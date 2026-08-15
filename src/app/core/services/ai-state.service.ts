import { Injectable, inject } from '@angular/core';
import type { AiSystemPromptPresetSelection } from '../../../../shared/models/system-prompt.model';
import type { BuiltAiPrompt } from '../../shared/utils/ai-prompt-builder';
import { ToastService } from '../../shared/services/toast.service';

export type { AiChatMessage } from '../../../../shared/models/ai.model';

export interface AiGenerationRequest {
    streamId: string;
    aiPrompt: BuiltAiPrompt;
    model?: string;
    modelId?: string;
    reasoningMode?: boolean;
    suppressErrorToasts?: boolean;
    systemPromptPreset?: AiSystemPromptPresetSelection;
}

@Injectable({ providedIn: 'root' })
export class AIStateService {
    model: string = '';
    toastService = inject(ToastService);

    /**
     * Signals the main process to abort one AI generation stream.
     * The in-flight fetch will be cancelled and `ai:generate-aborted` will be sent back.
     */
    abort(streamId: string): Promise<void> {
        return window.electronAPI.abortAiGeneration?.(streamId) ?? Promise.resolve();
    }

    async generate(request: AiGenerationRequest) {
        // Default to openai if the user hasn't selected one yet
        const providerToUse = request.model || this.model || 'openrouter';

        try {
            const response = await window.electronAPI.invoke('ai:generate', {
                streamId: request.streamId,
                model: providerToUse,
                modelId: request.modelId,
                prompt: request.aiPrompt.prompt,
                reasoningMode: request.reasoningMode ?? false,
                messages: request.aiPrompt.messages,
                ...(request.systemPromptPreset !== undefined
                    ? { systemPromptPreset: request.systemPromptPreset }
                    : {}),
            });

            if (response.aborted === true) {
                const abortError = new Error('AI generation was stopped.');
                abortError.name = 'AbortError';
                throw abortError;
            }

            return response.text;
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') throw e;

            console.error("Failed to generate text:", e);
            if (e instanceof Error && !request.suppressErrorToasts) {
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
