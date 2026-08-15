import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveSystemPromptPresetIds } from '../../../../shared/models/system-prompt.model';
import { ElectronService } from '../../core/services/electron.service';
import { SystemPromptSelectionService } from './system-prompt-selection.service';

describe('SystemPromptSelectionService', () => {
  let service: SystemPromptSelectionService;
  let invoke: ReturnType<typeof vi.fn>;

  const defaults = activeIds();
  const custom = activeIds({ chat: 'custom-chat' });

  beforeEach(() => {
    invoke = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        SystemPromptSelectionService,
        { provide: ElectronService, useValue: { invoke } },
      ],
    });
    service = TestBed.inject(SystemPromptSelectionService);
  });

  it('loads lazily and isolates cached selections by book', async () => {
    invoke.mockResolvedValueOnce(defaults).mockResolvedValueOnce(custom);

    await expect(service.getActivePresetId('book-1', 'chat')).resolves.toBe('default-assistant');
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(defaults);
    await expect(service.getActivePresetIds('book-2')).resolves.toBe(custom);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenNthCalledWith(1, 'system-prompts:list-active', { bookId: 'book-1' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'system-prompts:list-active', { bookId: 'book-2' });
  });

  it('force reloads and invalidates a cached book', async () => {
    invoke.mockResolvedValueOnce(defaults).mockResolvedValueOnce(custom).mockResolvedValueOnce(defaults);

    await service.getActivePresetIds('book-1');
    await expect(service.getActivePresetIds('book-1', true)).resolves.toBe(custom);
    service.invalidate('book-1');
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(defaults);

    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('replaces the cache with authoritative set and reset responses', async () => {
    invoke.mockResolvedValueOnce(defaults).mockResolvedValueOnce(custom).mockResolvedValueOnce(defaults);

    await service.getActivePresetIds('book-1');
    await expect(service.setActivePreset('book-1', 'chat', 'custom-chat')).resolves.toBe(custom);
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(custom);
    await expect(service.resetActivePreset('book-1', 'chat')).resolves.toBe(defaults);
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(defaults);

    expect(invoke).toHaveBeenNthCalledWith(2, 'system-prompts:set-active', {
      bookId: 'book-1',
      category: 'chat',
      presetId: 'custom-chat',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'system-prompts:reset-active', {
      bookId: 'book-1',
      category: 'chat',
    });
  });

  it('propagates failures without replacing an existing cache entry', async () => {
    invoke.mockResolvedValueOnce(defaults).mockRejectedValueOnce(new Error('IPC failed'));

    await service.getActivePresetIds('book-1');
    await expect(service.getActivePresetIds('book-1', true)).rejects.toThrow('IPC failed');
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(defaults);

    invoke.mockRejectedValueOnce(new Error('Set failed'));
    await expect(service.setActivePreset('book-1', 'chat', 'custom-chat')).rejects.toThrow('Set failed');
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(defaults);
  });

  it('does not create a fallback cache entry when initial loading fails', async () => {
    invoke.mockRejectedValueOnce(new Error('IPC failed')).mockResolvedValueOnce(custom);

    await expect(service.getActivePresetIds('book-1')).rejects.toThrow('IPC failed');
    await expect(service.getActivePresetIds('book-1')).resolves.toBe(custom);

    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

function activeIds(
  overrides: Partial<ActiveSystemPromptPresetIds> = {},
): ActiveSystemPromptPresetIds {
  return {
    chat: 'default-assistant',
    sceneBeat: 'default-scene-beat',
    rephrase: 'default-rephrase',
    summary: 'default-summary',
    expand: 'default-expand',
    shorten: 'default-shorten',
    title: 'default-title',
    ...overrides,
  };
}
