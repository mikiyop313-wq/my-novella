import { Injectable, inject } from '@angular/core';

import { ElectronService } from '../../../core/services/electron.service';
import {
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  UpdateChatMessageDto,
  UpdateChatThreadDto,
} from '../../../../../shared/models/chat.model';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly electronService = inject(ElectronService);

  async getThreads(bookId: string, includeArchived = false): Promise<ChatThreadDto[]> {
    return await this.electronService.invoke('chat:get-threads', { bookId, includeArchived });
  }

  async getThread(id: string): Promise<ChatThreadDetailDto | undefined> {
    return await this.electronService.invoke('chat:get-thread', { id });
  }

  async createThread(data: CreateChatThreadDto): Promise<ChatThreadDto> {
    return await this.electronService.invoke('chat:create-thread', { data });
  }

  async updateThread(
    id: string,
    data: UpdateChatThreadDto,
  ): Promise<ChatThreadDto | undefined> {
    return await this.electronService.invoke('chat:update-thread', { id, data });
  }

  async archiveThread(id: string): Promise<ChatThreadDto | undefined> {
    return await this.electronService.invoke('chat:archive-thread', { id });
  }

  async deleteThread(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('chat:delete-thread', { id });
  }

  async createMessage(data: CreateChatMessageDto): Promise<ChatMessageDetailDto> {
    return await this.electronService.invoke('chat:create-message', { data });
  }

  async updateMessage(
    id: string,
    data: UpdateChatMessageDto,
  ): Promise<ChatMessageDetailDto | undefined> {
    return await this.electronService.invoke('chat:update-message', { id, data });
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('chat:delete-message', { id });
  }
}
