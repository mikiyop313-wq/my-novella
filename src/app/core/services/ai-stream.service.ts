import { Injectable, WritableSignal, inject, signal } from '@angular/core';

import type { SystemPromptCategory } from '../../../../shared/models/system-prompt.model';
import { SystemPromptSelectionService } from '../../shared/services/system-prompt-selection.service';
import { ToastService } from '../../shared/services/toast.service';
import { AIStateService, type AiChatMessage } from './ai-state.service';
import { SystemPromptModelService } from '../../shared/services/system-prompt-model.service';

export type LoadingStatus = 'idle' | 'loading' | 'thinking' | 'generating';

export interface AiStreamRequest {
  streamId: string;
  bookId: string;
  systemPromptCategory: SystemPromptCategory;
  prompt: string;
  messages?: AiChatMessage[];
  provider?: string;
  modelId?: string;
  reasoningMode?: boolean;
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

  public readonly loadingState = new Map<string, WritableSignal<LoadingStatus>>();

  getLoadingSignal(streamId: string): WritableSignal<LoadingStatus> {
    let loadingSig = this.loadingState.get(streamId);

    if (!loadingSig) {
      loadingSig = signal<LoadingStatus>('idle');
      this.loadingState.set(streamId, loadingSig);
    }

    return loadingSig;
  }

  async stopStream(streamId: string): Promise<void> {
    await this.aiStateService.abort();
    this.setLoadingStatus(streamId, 'idle');
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

    this.setLoadingStatus(request.streamId, 'loading', request.onStatusChange);

    try {
      let presetId: string;
      try {
        presetId = await this.systemPromptSelectionService.getActivePresetId(
          request.bookId,
          request.systemPromptCategory,
        );
      } catch (error) {
        this.toastService.error(
          'Unable to load the active system prompt preset.',
          'AI Generation',
        );
        throw error;
      }

      if (request.onToken && window.electronAPI?.onMessage) {
        cleanupToken = window.electronAPI.onMessage('ai:generate-stream', (token: string) => {
          if (!token) return;

          this.setLoadingStatus(request.streamId, 'generating', request.onStatusChange);

          for (const char of token) {
            if (char !== '\r') request.onToken?.(char);
          }
        });
      }

      if (request.reasoningMode && window.electronAPI?.onMessage) {
        cleanupReasoning = window.electronAPI.onMessage(
          'ai:generate-reasoning-stream',
          (token: string) => {
            if (!token) return;

            this.setLoadingStatus(request.streamId, 'thinking', request.onStatusChange);
            reasoningBuffer += token;
            emitReasoningUpdate();
          },
        );
      }

      let provider = request.provider;
      let modelId = request.modelId;
      if (provider === undefined && modelId === undefined) {
        const model = await this.systemPromptModelService.resolveActiveModel(
          request.bookId,
          request.systemPromptCategory,
        );
        if (model.status !== 'ready') {
          this.toastService.error(
            model.reason === 'openrouter-unconfigured'
              ? 'Configure OpenRouter in Settings before using this action.'
              : 'Choose an available default model in System Prompts.',
            'AI Generation',
          );
          throw new Error('The active system prompt model is unavailable.');
        }
        provider = model.provider;
        modelId = model.modelId;
      }

      return await this.aiStateService.generate(
        request.prompt,
        provider,
        modelId,
        request.reasoningMode,
        request.messages,
        { category: request.systemPromptCategory, presetId },
      );
    } finally {
      cleanupToken?.();
      cleanupReasoning?.();
      emitReasoningUpdate(true);
      this.setLoadingStatus(request.streamId, 'idle', request.onStatusChange);
    }
  }

  private setLoadingStatus(
    streamId: string,
    status: LoadingStatus,
    onStatusChange?: (status: LoadingStatus) => void
  ): void {
    const loadingSig = this.getLoadingSignal(streamId);

    if (loadingSig() === status) return;

    loadingSig.set(status);
    onStatusChange?.(status);
  }
}
