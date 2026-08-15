import { ipcMain } from 'electron';

import { chatRepository } from '../../../db/repositories/chat.repository';
import {
  CreateChatMessagePayload,
  CreateChatThreadPayload,
  DeleteChatMessagePayload,
  DeleteChatThreadPayload,
  GetChatThreadPayload,
  GetChatThreadsPayload,
  SelectChatBranchPayload,
  UpdateChatMessagePayload,
  UpdateChatThreadPayload,
} from '../../../shared/models/chat.model';

export function setupChatHandlers() {
  ipcMain.handle(
    'chat:get-threads',
    async (_, { bookId, includeArchived }: GetChatThreadsPayload) => {
      try {
        return await chatRepository.getThreads(bookId, includeArchived);
      } catch (error) {
        console.error('Failed to get chat threads:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('chat:get-thread', async (_, { id }: GetChatThreadPayload) => {
    try {
      return await chatRepository.getThread(id);
    } catch (error) {
      console.error('Failed to get chat thread:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:create-thread', async (_, { data }: CreateChatThreadPayload) => {
    try {
      return await chatRepository.createThread(data);
    } catch (error) {
      console.error('Failed to create chat thread:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:update-thread', async (_, { id, data }: UpdateChatThreadPayload) => {
    try {
      return await chatRepository.updateThread(id, data);
    } catch (error) {
      console.error('Failed to update chat thread:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:archive-thread', async (_, { id }: DeleteChatThreadPayload) => {
    try {
      return await chatRepository.archiveThread(id);
    } catch (error) {
      console.error('Failed to archive chat thread:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:delete-thread', async (_, { id }: DeleteChatThreadPayload) => {
    try {
      return await chatRepository.deleteThread(id);
    } catch (error) {
      console.error('Failed to delete chat thread:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:create-message', async (_, { data }: CreateChatMessagePayload) => {
    try {
      return await chatRepository.createMessage(data);
    } catch (error) {
      console.error('Failed to create chat message:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:update-message', async (_, { id, data }: UpdateChatMessagePayload) => {
    try {
      return await chatRepository.updateMessage(id, data);
    } catch (error) {
      console.error('Failed to update chat message:', error);
      throw error;
    }
  });

  ipcMain.handle('chat:delete-message', async (_, { id }: DeleteChatMessagePayload) => {
    try {
      return await chatRepository.deleteMessage(id);
    } catch (error) {
      console.error('Failed to delete chat message:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'chat:select-branch',
    async (_, { threadId, branchGroupId, selectedMessageId }: SelectChatBranchPayload) => {
      try {
        return await chatRepository.selectBranch(threadId, branchGroupId, selectedMessageId);
      } catch (error) {
        console.error('Failed to select chat branch:', error);
        throw error;
      }
    },
  );
}
