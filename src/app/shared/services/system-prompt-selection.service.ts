import { Injectable, inject } from '@angular/core';

import type {
  ActiveSystemPromptPresetIds,
  SystemPromptCategory,
} from '../../../../shared/models/system-prompt.model';
import { ElectronService } from '../../core/services/electron.service';

@Injectable({ providedIn: 'root' })
export class SystemPromptSelectionService {
  private readonly electronService = inject(ElectronService);
  private readonly activePresetIdsByBook = new Map<string, ActiveSystemPromptPresetIds>();

  async getActivePresetIds(
    bookId: string,
    forceReload = false,
  ): Promise<ActiveSystemPromptPresetIds> {
    const cached = this.activePresetIdsByBook.get(bookId);
    if (cached && !forceReload) return cached;

    const activePresetIds = await this.electronService.invoke('system-prompts:list-active', {
      bookId,
    }) as ActiveSystemPromptPresetIds;
    this.activePresetIdsByBook.set(bookId, activePresetIds);
    return activePresetIds;
  }

  async getActivePresetId(bookId: string, category: SystemPromptCategory): Promise<string> {
    return (await this.getActivePresetIds(bookId))[category];
  }

  async setActivePreset(
    bookId: string,
    category: SystemPromptCategory,
    presetId: string,
  ): Promise<ActiveSystemPromptPresetIds> {
    const activePresetIds = await this.electronService.invoke('system-prompts:set-active', {
      bookId,
      category,
      presetId,
    }) as ActiveSystemPromptPresetIds;
    this.activePresetIdsByBook.set(bookId, activePresetIds);
    return activePresetIds;
  }

  async resetActivePreset(
    bookId: string,
    category: SystemPromptCategory,
  ): Promise<ActiveSystemPromptPresetIds> {
    const activePresetIds = await this.electronService.invoke('system-prompts:reset-active', {
      bookId,
      category,
    }) as ActiveSystemPromptPresetIds;
    this.activePresetIdsByBook.set(bookId, activePresetIds);
    return activePresetIds;
  }

  invalidate(bookId: string): void {
    this.activePresetIdsByBook.delete(bookId);
  }
}
