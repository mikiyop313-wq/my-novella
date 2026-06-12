import { ipcMain } from 'electron';

import { codexRepository } from '../../../db/repositories/codex.repository';
import {
  CreateCodexEntryProgressionPayload,
  CreateCodexEntryNotePayload,
  CreateCodexEntryPayload,
  DeleteCodexEntryProgressionPayload,
  DeleteCodexEntryNotePayload,
  DeleteCodexEntryPayload,
  GetCodexEntriesPayload,
  GetCodexEntryCountsPayload,
  GetCodexEntryPayload,
  GetCodexEntryNotesPayload,
  GetCodexEntryProgressionPayload,
  UpdateCodexEntryProgressionPayload,
  UpdateCodexEntryNotePayload,
  UpdateCodexEntryPayload,
} from '../../../shared/models/codex.model';

export function setupCodexHandlers() {
  ipcMain.handle('codex:get-entries', async (_, { bookId, filters }: GetCodexEntriesPayload) => {
    try {
      return await codexRepository.getEntries(bookId, filters);
    } catch (error) {
      console.error('Failed to get codex entries:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:get-entry', async (_, { id }: GetCodexEntryPayload) => {
    try {
      return await codexRepository.getById(id);
    } catch (error) {
      console.error('Failed to get codex entry:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:get-counts', async (_, { bookId }: GetCodexEntryCountsPayload) => {
    try {
      return await codexRepository.getCounts(bookId);
    } catch (error) {
      console.error('Failed to get codex counts:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'codex:get-entry-notes',
    async (_, { entryId }: GetCodexEntryNotesPayload) => {
      try {
        return await codexRepository.getEntryNotes(entryId);
      } catch (error) {
        console.error('Failed to get codex entry notes:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'codex:get-entry-progression',
    async (_, { entryId }: GetCodexEntryProgressionPayload) => {
      try {
        return await codexRepository.getEntryProgression(entryId);
      } catch (error) {
        console.error('Failed to get codex entry progression:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('codex:create-entry', async (_, { data }: CreateCodexEntryPayload) => {
    try {
      return await codexRepository.create(data);
    } catch (error) {
      console.error('Failed to create codex entry:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:update-entry', async (_, { id, data }: UpdateCodexEntryPayload) => {
    try {
      return await codexRepository.update(id, data);
    } catch (error) {
      console.error('Failed to update codex entry:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:create-entry-note', async (_, { data }: CreateCodexEntryNotePayload) => {
    try {
      return await codexRepository.createEntryNote(data);
    } catch (error) {
      console.error('Failed to create codex entry note:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:update-entry-note', async (_, { id, data }: UpdateCodexEntryNotePayload) => {
    try {
      return await codexRepository.updateEntryNote(id, data);
    } catch (error) {
      console.error('Failed to update codex entry note:', error);
      throw error;
    }
  });

  ipcMain.handle('codex:delete-entry-note', async (_, { id }: DeleteCodexEntryNotePayload) => {
    try {
      return await codexRepository.deleteEntryNote(id);
    } catch (error) {
      console.error('Failed to delete codex entry note:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'codex:create-entry-progression',
    async (_, { data }: CreateCodexEntryProgressionPayload) => {
      try {
        return await codexRepository.createEntryProgression(data);
      } catch (error) {
        console.error('Failed to create codex entry progression:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'codex:update-entry-progression',
    async (_, { id, data }: UpdateCodexEntryProgressionPayload) => {
      try {
        return await codexRepository.updateEntryProgression(id, data);
      } catch (error) {
        console.error('Failed to update codex entry progression:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'codex:delete-entry-progression',
    async (_, { id }: DeleteCodexEntryProgressionPayload) => {
      try {
        return await codexRepository.deleteEntryProgression(id);
      } catch (error) {
        console.error('Failed to delete codex entry progression:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('codex:delete-entry', async (_, { id }: DeleteCodexEntryPayload) => {
    try {
      return await codexRepository.delete(id);
    } catch (error) {
      console.error('Failed to delete codex entry:', error);
      throw error;
    }
  });
}
