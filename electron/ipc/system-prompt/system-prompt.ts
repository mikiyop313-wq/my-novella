import { ipcMain } from 'electron';

import { systemPromptRepository } from '../../../db/repositories/system-prompt.repository';
import type {
  CreateSystemPromptPresetPayload,
  DeleteSystemPromptPresetPayload,
  GetBuiltInSystemPromptModelPayload,
  ListActiveSystemPromptPresetsPayload,
  ListAvailableSystemPromptPresetsPayload,
  ResetActiveSystemPromptPresetPayload,
  ResolveActiveSystemPromptModelPayload,
  SetBuiltInSystemPromptModelPayload,
  SetActiveSystemPromptPresetPayload,
  UpdateSystemPromptPresetPayload,
} from '../../../shared/models/system-prompt.model';

export function setupSystemPromptHandlers(): void {
  ipcMain.handle('system-prompts:list-global', async () => {
    try {
      return await systemPromptRepository.listGlobal();
    } catch (error) {
      console.error('Failed to list global system prompt presets:', error);
      throw error;
    }
  });

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

  ipcMain.handle(
    'system-prompts:list-active',
    async (_, { bookId }: ListActiveSystemPromptPresetsPayload) => {
      try {
        return await systemPromptRepository.listActivePresetIdsForBook(bookId);
      } catch (error) {
        console.error('Failed to list active system prompt presets:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'system-prompts:set-active',
    async (_, { bookId, category, presetId }: SetActiveSystemPromptPresetPayload) => {
      try {
        return await systemPromptRepository.setActivePreset(bookId, category, presetId);
      } catch (error) {
        console.error('Failed to set active system prompt preset:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'system-prompts:reset-active',
    async (_, { bookId, category }: ResetActiveSystemPromptPresetPayload) => {
      try {
        return await systemPromptRepository.resetActivePreset(bookId, category);
      } catch (error) {
        console.error('Failed to reset active system prompt preset:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'system-prompts:get-built-in-model',
    async (_, { presetId }: GetBuiltInSystemPromptModelPayload) => {
      try {
        return await systemPromptRepository.getBuiltInDefaultModelId(presetId);
      } catch (error) {
        console.error('Failed to get the built-in system prompt model:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'system-prompts:set-built-in-model',
    async (_, { presetId, defaultModelId }: SetBuiltInSystemPromptModelPayload) => {
      try {
        return await systemPromptRepository.setBuiltInDefaultModelId(presetId, defaultModelId);
      } catch (error) {
        console.error('Failed to set the built-in system prompt model:', error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    'system-prompts:resolve-active-model',
    async (_, { bookId, category }: ResolveActiveSystemPromptModelPayload) => {
      try {
        return await systemPromptRepository.resolveActiveModel(bookId, category);
      } catch (error) {
        console.error('Failed to resolve the active system prompt model:', error);
        throw error;
      }
    },
  );
}
