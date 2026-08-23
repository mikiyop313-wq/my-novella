import { ipcMain } from 'electron';

import { generalNoteRepository } from '../../../db/repositories/general-note.repository';
import type {
  CreateGeneralNotePayload,
  DeleteGeneralNotePayload,
  GetGeneralNotesPayload,
  UpdateGeneralNotePayload,
} from '../../../shared/models/general-note.model';

export function setupGeneralNoteHandlers(): void {
  ipcMain.handle('notes:get', async (_, { bookId }: GetGeneralNotesPayload) =>
    generalNoteRepository.getNotes(bookId),
  );
  ipcMain.handle('notes:create', async (_, { data }: CreateGeneralNotePayload) =>
    generalNoteRepository.create(data),
  );
  ipcMain.handle('notes:update', async (_, { id, data }: UpdateGeneralNotePayload) =>
    generalNoteRepository.update(id, data),
  );
  ipcMain.handle('notes:delete', async (_, { id }: DeleteGeneralNotePayload) =>
    generalNoteRepository.delete(id),
  );
}
