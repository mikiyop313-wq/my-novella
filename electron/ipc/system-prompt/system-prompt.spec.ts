import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listAvailableForBook: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../../db/repositories/system-prompt.repository', () => ({
  systemPromptRepository: {
    listAvailableForBook: mocks.listAvailableForBook,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

import { setupSystemPromptHandlers } from './system-prompt';

describe('system prompt IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupSystemPromptHandlers();
  });

  it('registers and forwards list, create, update, and delete payloads', async () => {
    const createData = {
      name: 'Shared Editor',
      systemPrompt: 'Edit fiction.',
      category: 'rephrase' as const,
      scope: 'global' as const,
      temperature: 0.5,
      topP: 1,
      maxOutputTokens: null,
      presencePenalty: 0,
      frequencyPenalty: 0,
    };
    const updateData = {
      category: 'summary' as const,
      ownership: { scope: 'book' as const, bookId: 'book-1' },
    };

    await mocks.handlers.get('system-prompts:list-available')?.({}, { bookId: 'book-1' });
    await mocks.handlers.get('system-prompts:create')?.({}, { data: createData });
    await mocks.handlers.get('system-prompts:update')?.({}, { id: 'preset-1', data: updateData });
    await mocks.handlers.get('system-prompts:delete')?.({}, { id: 'preset-1' });

    expect([...mocks.handlers.keys()]).toEqual([
      'system-prompts:list-available',
      'system-prompts:create',
      'system-prompts:update',
      'system-prompts:delete',
    ]);
    expect(mocks.listAvailableForBook).toHaveBeenCalledWith('book-1');
    expect(mocks.create).toHaveBeenCalledWith(createData);
    expect(mocks.update).toHaveBeenCalledWith('preset-1', updateData);
    expect(mocks.delete).toHaveBeenCalledWith('preset-1');
  });
});
