import { Injectable, inject } from '@angular/core';

import {
  type CodexDetachedEntryChangedEvent,
  type CodexDetachedWindowOpenRequest,
  type CodexDetachedWindowSession,
} from '../../../../../shared/models/codex-window.model';
import { ElectronService } from '../../../core/services/electron.service';

@Injectable({
  providedIn: 'root',
})
export class CodexWindowService {
  private readonly electronService = inject(ElectronService);

  async openDetachedWindow(request: CodexDetachedWindowOpenRequest): Promise<string> {
    const result = await this.electronService.invoke('codex-window:open', request) as { sessionId: string };
    return result.sessionId;
  }

  async getDetachedSession(sessionId: string): Promise<CodexDetachedWindowSession | null> {
    return await this.electronService.invoke('codex-window:get-session', { sessionId }) as CodexDetachedWindowSession | null;
  }

  async focusDetachedEntry(entryId: string): Promise<boolean> {
    try {
      return await this.electronService.invoke('codex-window:focus-entry', { entryId }) as boolean;
    } catch {
      return false;
    }
  }

  notifyDetachedEntryChanged(event: CodexDetachedEntryChangedEvent): void {
    this.electronService.send('codex-window:entry-changed', event);
  }

  onDetachedEntryChanged(callback: (event: CodexDetachedEntryChangedEvent) => void): () => void {
    return this.electronService.on('codex-window:entry-changed', callback);
  }
}
