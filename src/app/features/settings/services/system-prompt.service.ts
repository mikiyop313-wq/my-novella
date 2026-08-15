import { Injectable, inject } from '@angular/core';

import type {
  CreateSystemPromptPresetDto,
  SystemPromptPresetDto,
  UpdateSystemPromptPresetDto,
} from '../../../../../shared/models/system-prompt.model';
import { ElectronService } from '../../../core/services/electron.service';

@Injectable({
  providedIn: 'root',
})
export class SystemPromptService {
  private readonly electronService = inject(ElectronService);

  async listGlobal(): Promise<SystemPromptPresetDto[]> {
    return await this.electronService.invoke('system-prompts:list-global');
  }

  async listAvailable(bookId: string): Promise<SystemPromptPresetDto[]> {
    return await this.electronService.invoke('system-prompts:list-available', { bookId });
  }

  async create(data: CreateSystemPromptPresetDto): Promise<SystemPromptPresetDto> {
    return await this.electronService.invoke('system-prompts:create', { data });
  }

  async update(
    id: string,
    data: UpdateSystemPromptPresetDto,
  ): Promise<SystemPromptPresetDto | undefined> {
    return await this.electronService.invoke('system-prompts:update', { id, data });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('system-prompts:delete', { id });
  }
}
