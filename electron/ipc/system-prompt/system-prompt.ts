import { ipcMain } from 'electron';

import { systemPromptRepository } from '../../../db/repositories/system-prompt.repository';
import type {
  CreateSystemPromptPresetPayload,
  DeleteSystemPromptPresetPayload,
  ListAvailableSystemPromptPresetsPayload,
  UpdateSystemPromptPresetPayload,
} from '../../../shared/models/system-prompt.model';

export function setupSystemPromptHandlers(): void {
  ipcMain.handle(
    'system-prompts:list-available',
    async (_, { bookId }: ListAvailableSystemPromptPresetsPayload) => {
      try {
        return await systemPromptRepository.listAvailableForBook(bookId);
      } catch (error) {
        console.error('Failed to list system prompt presets:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('system-prompts:create', async (_, { data }: CreateSystemPromptPresetPayload) => {
    try {
      return await systemPromptRepository.create(data);
    } catch (error) {
      console.error('Failed to create system prompt preset:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'system-prompts:update',
    async (_, { id, data }: UpdateSystemPromptPresetPayload) => {
      try {
        return await systemPromptRepository.update(id, data);
      } catch (error) {
        console.error('Failed to update system prompt preset:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('system-prompts:delete', async (_, { id }: DeleteSystemPromptPresetPayload) => {
    try {
      return await systemPromptRepository.delete(id);
    } catch (error) {
      console.error('Failed to delete system prompt preset:', error);
      throw error;
    }
  });
}
