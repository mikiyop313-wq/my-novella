import { Injectable, WritableSignal, inject, signal } from '@angular/core';

import { AIStateService, type AiChatMessage } from './ai-state.service';

export type LoadingStatus = 'idle' | 'loading' | 'thinking' | 'generating';

export interface AiStreamRequest {
  streamId: string;
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
    let isNewlineSequence = false;
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

    if (request.onToken && window.electronAPI?.onMessage) {
      cleanupToken = window.electronAPI.onMessage('ai:generate-stream', (token: string) => {
        if (!token) return;

        this.setLoadingStatus(request.streamId, 'generating', request.onStatusChange);

        for (const char of token) {
          if (char === '\r') continue;

          if (char === '\n') {
            if (!isNewlineSequence) {
              request.onToken?.('\n');
              isNewlineSequence = true;
            }

            continue;
          }

          isNewlineSequence = false;
          request.onToken?.(char);
        }
      });
    }

    if (request.reasoningMode && window.electronAPI?.onMessage) {
      cleanupReasoning = window.electronAPI.onMessage('ai:generate-reasoning-stream', (token: string) => {
        if (!token) return;

        this.setLoadingStatus(request.streamId, 'thinking', request.onStatusChange);
        reasoningBuffer += token;
        emitReasoningUpdate();
      });
    }

    try {
      return await this.aiStateService.generate(
        request.prompt,
        request.provider,
        request.modelId,
        request.reasoningMode,
        request.messages,
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
