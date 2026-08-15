import { Injectable, inject } from '@angular/core';

import { CodexStore } from '../store/codex.store';
import { CodexWindowService } from './codex-window.service';

@Injectable({
  providedIn: 'root',
})
export class CodexEntryOpenerService {
  private readonly codexWindowService = inject(CodexWindowService);
  private readonly codexStore = inject(CodexStore);

  async open(entryId: string): Promise<void> {
    if (!entryId) return;

    if (await this.codexWindowService.focusDetachedEntry(entryId)) {
      this.codexStore.closeCreateMenu();
      return;
    }

    await this.codexStore.openEntryById(entryId);
  }
}
