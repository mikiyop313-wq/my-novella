import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateSystemPromptPresetDto,
  UpdateSystemPromptPresetDto,
} from '../../../../../shared/models/system-prompt.model';
import { ElectronService } from '../../../core/services/electron.service';
import { SystemPromptService } from './system-prompt.service';

describe('SystemPromptService', () => {
  let service: SystemPromptService;
  let invoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invoke = vi.fn();
    TestBed.configureTestingModule({
      providers: [SystemPromptService, { provide: ElectronService, useValue: { invoke } }],
    });
    service = TestBed.inject(SystemPromptService);
  });

  it('forwards list, create, update, and delete requests to Electron IPC', async () => {
    const createData: CreateSystemPromptPresetDto = {
      name: 'Scene Architect',
      systemPrompt: 'Plan a focused scene.',
      category: 'sceneBeat',
      scope: 'book',
      bookId: 'book-1',
      temperature: 0.5,
      topP: 1,
      maxOutputTokens: null,
      presencePenalty: 0,
      frequencyPenalty: 0,
    };
    const updateData: UpdateSystemPromptPresetDto = {
      name: 'Scene Designer',
      temperature: 0.7,
    };
    invoke
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: 'preset-1' })
      .mockResolvedValueOnce({ id: 'preset-1' })
      .mockResolvedValueOnce({ success: true });

    await service.listGlobal();
    await service.listAvailable('book-1');
    await service.create(createData);
    await service.update('preset-1', updateData);
    await service.delete('preset-1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'system-prompts:list-global');
    expect(invoke).toHaveBeenNthCalledWith(2, 'system-prompts:list-available', {
      bookId: 'book-1',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'system-prompts:create', { data: createData });
    expect(invoke).toHaveBeenNthCalledWith(4, 'system-prompts:update', {
      id: 'preset-1',
      data: updateData,
    });
    expect(invoke).toHaveBeenNthCalledWith(5, 'system-prompts:delete', { id: 'preset-1' });
  });
});
