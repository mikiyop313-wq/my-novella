import { Injectable, inject } from '@angular/core';

import { SystemPromptSelectionService } from '../../shared/services/system-prompt-selection.service';
import { ToastService } from '../../shared/services/toast.service';
import type { BuiltAiPrompt } from '../../shared/utils/ai-prompt-builder';
import type { AiStreamEvent } from '../../../../shared/models/ai.model';
import { AIStateService } from './ai-state.service';
import { SystemPromptModelService } from '../../shared/services/system-prompt-model.service';

export type LoadingStatus = 'idle' | 'loading' | 'thinking' | 'generating';

export interface AiStreamRequest {
  streamId: string;
  bookId: string;
  aiPrompt: BuiltAiPrompt;
  provider?: string;
  modelId?: string;
  reasoningMode?: boolean;
  suppressErrorToasts?: boolean;
  onToken?: (token: string) => void;
  onReasoningUpdate?: (reasoningText: string) => void;
  onStatusChange?: (status: LoadingStatus) => void;
}

const REASONING_UPDATE_INTERVAL_MS = 200;

@Injectable({ providedIn: 'root' })
export class AiStreamService {
  private readonly aiStateService = inject(AIStateService);
  private readonly systemPromptSelectionService = inject(SystemPromptSelectionService);
  private readonly toastService = inject(ToastService);
  private readonly systemPromptModelService = inject(SystemPromptModelService);

  async stopStream(streamId: string): Promise<void> {
    await this.aiStateService.abort(streamId);
  }

  async streamText(request: AiStreamRequest): Promise<string> {
    let reasoningBuffer = '';
    let lastReasoningUpdate = -Infinity;
    let lastEmittedReasoning = '';
    let cleanupToken: (() => void) | undefined;
    let cleanupReasoning: (() => void) | undefined;

    const emitReasoningUpdate = (force = false) => {
      if (!request.onReasoningUpdate || reasoningBuffer === lastEmittedReasoning) return;

      const now = Date.now();
      if (!force && now - lastReasoningUpdate <= REASONING_UPDATE_INTERVAL_MS) return;

      request.onReasoningUpdate(reasoningBuffer);
      lastEmittedReasoning = reasoningBuffer;
      lastReasoningUpdate = now;
    };

    this.setLoadingStatus('loading', request.onStatusChange);

    try {
      let presetId: string;
      try {
        presetId = await this.systemPromptSelectionService.getActivePresetId(
          request.bookId,
          request.aiPrompt.systemPromptCategory,
        );
      } catch (error) {
        if (!request.suppressErrorToasts) {
          this.toastService.error(
            'Unable to load the active system prompt preset.',
            'AI Generation',
          );
        }
        throw error;
      }

      if (request.onToken && window.electronAPI?.onMessage) {
        cleanupToken = window.electronAPI.onMessage('ai:generate-stream', (event: AiStreamEvent) => {
          if (event.streamId !== request.streamId || !event.token) return;

          this.setLoadingStatus('generating', request.onStatusChange);

          for (const char of event.token) {
            if (char !== '\r') request.onToken?.(char);
          }
        });
      }

      if (request.reasoningMode && window.electronAPI?.onMessage) {
        cleanupReasoning = window.electronAPI.onMessage(
          'ai:generate-reasoning-stream',
          (event: AiStreamEvent) => {
            if (event.streamId !== request.streamId || !event.token) return;

            this.setLoadingStatus('thinking', request.onStatusChange);
            reasoningBuffer += event.token;
            emitReasoningUpdate();
          },
        );
      }

      let provider = request.provider;
      let modelId = request.modelId;
      if (provider === undefined && modelId === undefined) {
        const model = await this.systemPromptModelService.resolveActiveModel(
          request.bookId,
          request.aiPrompt.systemPromptCategory,
        );
        if (model.status !== 'ready') {
          if (!request.suppressErrorToasts) {
            this.toastService.error(
              model.reason === 'openrouter-unconfigured'
                ? 'Configure OpenRouter in Settings before using this action.'
                : 'Choose an available default model in System Prompts.',
              'AI Generation',
            );
          }
          throw new Error('The active system prompt model is unavailable.');
        }
        provider = model.provider;
        modelId = model.modelId;
      }

      return await this.aiStateService.generate({
        streamId: request.streamId,
        aiPrompt: request.aiPrompt,
        model: provider,
        modelId,
        reasoningMode: request.reasoningMode,
        suppressErrorToasts: request.suppressErrorToasts,
        systemPromptPreset: {
          category: request.aiPrompt.systemPromptCategory,
          presetId,
        },
      });
    } finally {
      cleanupToken?.();
      cleanupReasoning?.();
      emitReasoningUpdate(true);
      this.setLoadingStatus('idle', request.onStatusChange);
    }
  }

  private setLoadingStatus(
    status: LoadingStatus,
    onStatusChange?: (status: LoadingStatus) => void
  ): void {
    onStatusChange?.(status);
  }
}
