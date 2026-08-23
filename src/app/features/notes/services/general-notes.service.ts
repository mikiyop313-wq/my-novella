import { Injectable, inject } from '@angular/core';

import type {
  CreateGeneralNoteDto,
  GeneralNoteDto,
  UpdateGeneralNoteDto,
} from '../../../../../shared/models/general-note.model';
import { ElectronService } from '../../../core/services/electron.service';

@Injectable({ providedIn: 'root' })
export class GeneralNotesService {
  private readonly electronService = inject(ElectronService);

  async getNotes(bookId: string): Promise<GeneralNoteDto[]> {
    return this.electronService.invoke('notes:get', { bookId });
  }

  async createNote(data: CreateGeneralNoteDto): Promise<GeneralNoteDto> {
    return this.electronService.invoke('notes:create', { data });
  }

  async updateNote(id: string, data: UpdateGeneralNoteDto): Promise<GeneralNoteDto | undefined> {
    return this.electronService.invoke('notes:update', { id, data });
  }

  async deleteNote(id: string): Promise<{ success: boolean }> {
    return this.electronService.invoke('notes:delete', { id });
  }
}
