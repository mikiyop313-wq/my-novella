import { Injectable, inject, signal } from '@angular/core';

import {
  type ChatDetachedWindowClosedEvent,
  type ChatDetachedWindowOpenRequest,
  type ChatDetachedWindowSession,
} from '../../../../../shared/models/chat-window.model';
import { ElectronService } from '../../../core/services/electron.service';

@Injectable({
  providedIn: 'root',
})
export class ChatWindowService {
  private readonly electronService = inject(ElectronService);
  private readonly detachedBookIds = signal<ReadonlySet<string>>(new Set<string>());

  constructor() {
    this.electronService.on('chat-window:closed', event => {
      this.markBookDetached(event.bookId, false);
    });
  }

  async openDetachedWindow(request: ChatDetachedWindowOpenRequest): Promise<string> {
    const result = await this.electronService.invoke('chat-window:open', request) as { sessionId: string };
    this.markBookDetached(request.bookId, true);
    return result.sessionId;
  }

  async getDetachedSession(sessionId: string): Promise<ChatDetachedWindowSession | null> {
    return await this.electronService.invoke('chat-window:get-session', { sessionId }) as ChatDetachedWindowSession | null;
  }

  onDetachedWindowClosed(callback: (event: ChatDetachedWindowClosedEvent) => void): () => void {
    return this.electronService.on('chat-window:closed', callback);
  }

  isBookDetached(bookId: string | null): boolean {
    return !!bookId && this.detachedBookIds().has(bookId);
  }

  private markBookDetached(bookId: string, isDetached: boolean): void {
    this.detachedBookIds.update(bookIds => {
      const nextBookIds = new Set(bookIds);

      if (isDetached) {
        nextBookIds.add(bookId);
      } else {
        nextBookIds.delete(bookId);
      }

      return nextBookIds;
    });
  }
}
