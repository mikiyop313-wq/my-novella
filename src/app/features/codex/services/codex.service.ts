import { Injectable, inject } from '@angular/core';

import { ElectronService } from '../../../core/services/electron.service';
import {
  CodexEntryDetailDto,
  CodexEntryDto,
  CodexEntryListFiltersDto,
  CodexEntryNoteDto,
  CodexEntryProgressionDto,
  CreateCodexEntryDto,
  CreateCodexEntryNoteDto,
  CreateCodexEntryProgressionDto,
  UpdateCodexEntryDto,
  UpdateCodexEntryNoteDto,
  UpdateCodexEntryProgressionDto,
} from '../../../../../shared/models/codex.model';

@Injectable({
  providedIn: 'root',
})
export class CodexService {
  private readonly electronService = inject(ElectronService);

  async getEntries(
    bookId: string,
    filters?: CodexEntryListFiltersDto,
  ): Promise<CodexEntryDto[]> {
    return await this.electronService.invoke('codex:get-entries', { bookId, filters });
  }

  async createEntry(data: CreateCodexEntryDto): Promise<CodexEntryDto> {
    return await this.electronService.invoke('codex:create-entry', { data });
  }

  async getEntry(id: string): Promise<CodexEntryDetailDto | undefined> {
    return await this.electronService.invoke('codex:get-entry', { id });
  }

  async updateEntry(id: string, data: UpdateCodexEntryDto): Promise<CodexEntryDto | undefined> {
    return await this.electronService.invoke('codex:update-entry', { id, data });
  }

  async createEntryNote(data: CreateCodexEntryNoteDto): Promise<CodexEntryNoteDto> {
    return await this.electronService.invoke('codex:create-entry-note', { data });
  }

  async updateEntryNote(id: string, data: UpdateCodexEntryNoteDto): Promise<CodexEntryNoteDto | undefined> {
    return await this.electronService.invoke('codex:update-entry-note', { id, data });
  }

  async deleteEntryNote(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('codex:delete-entry-note', { id });
  }

  async createEntryProgression(
    data: CreateCodexEntryProgressionDto,
  ): Promise<CodexEntryProgressionDto> {
    return await this.electronService.invoke('codex:create-entry-progression', { data });
  }

  async updateEntryProgression(
    id: string,
    data: UpdateCodexEntryProgressionDto,
  ): Promise<CodexEntryProgressionDto | undefined> {
    return await this.electronService.invoke('codex:update-entry-progression', { id, data });
  }

  async deleteEntryProgression(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('codex:delete-entry-progression', { id });
  }

  async deleteEntry(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('codex:delete-entry', { id });
  }
}
