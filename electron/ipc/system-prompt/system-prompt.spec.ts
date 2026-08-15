import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listGlobal: vi.fn(),
  listAvailableForBook: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  listActivePresetIdsForBook: vi.fn(),
  setActivePreset: vi.fn(),
  resetActivePreset: vi.fn(),
  getBuiltInDefaultModelId: vi.fn(),
  setBuiltInDefaultModelId: vi.fn(),
  resolveActiveModel: vi.fn(),
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
    listGlobal: mocks.listGlobal,
    listAvailableForBook: mocks.listAvailableForBook,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    listActivePresetIdsForBook: mocks.listActivePresetIdsForBook,
    setActivePreset: mocks.setActivePreset,
    resetActivePreset: mocks.resetActivePreset,
    getBuiltInDefaultModelId: mocks.getBuiltInDefaultModelId,
    setBuiltInDefaultModelId: mocks.setBuiltInDefaultModelId,
    resolveActiveModel: mocks.resolveActiveModel,
  },
}));

import { setupSystemPromptHandlers } from './system-prompt';

describe('system prompt IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupSystemPromptHandlers();
  });

  it('registers and forwards preset and active-selection payloads', async () => {
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
      defaultModelId: 'deepseek/deepseek-v4-flash',
    };
    const updateData = {
      category: 'summary' as const,
      ownership: { scope: 'book' as const, bookId: 'book-1' },
    };

    await mocks.handlers.get('system-prompts:list-global')?.({});
    await mocks.handlers.get('system-prompts:list-available')?.({}, { bookId: 'book-1' });
    await mocks.handlers.get('system-prompts:create')?.({}, { data: createData });
    await mocks.handlers.get('system-prompts:update')?.({}, { id: 'preset-1', data: updateData });
    await mocks.handlers.get('system-prompts:delete')?.({}, { id: 'preset-1' });
    await mocks.handlers.get('system-prompts:list-active')?.({}, { bookId: 'book-1' });
    await mocks.handlers.get('system-prompts:set-active')?.(
      {},
      {
        bookId: 'book-1',
        category: 'chat',
        presetId: 'preset-1',
      },
    );
    await mocks.handlers.get('system-prompts:reset-active')?.(
      {},
      {
        bookId: 'book-1',
        category: 'chat',
      },
    );
    await mocks.handlers.get('system-prompts:get-built-in-model')?.(
      {},
      { presetId: 'default-summary' },
    );
    await mocks.handlers.get('system-prompts:set-built-in-model')?.(
      {},
      { presetId: 'default-summary', defaultModelId: 'openai/gpt-5' },
    );
    await mocks.handlers.get('system-prompts:resolve-active-model')?.(
      {},
      { bookId: 'book-1', category: 'summary' },
    );

    expect([...mocks.handlers.keys()]).toEqual([
      'system-prompts:list-global',
      'system-prompts:list-available',
      'system-prompts:create',
      'system-prompts:update',
      'system-prompts:delete',
      'system-prompts:list-active',
      'system-prompts:set-active',
      'system-prompts:reset-active',
      'system-prompts:get-built-in-model',
      'system-prompts:set-built-in-model',
      'system-prompts:resolve-active-model',
    ]);
    expect(mocks.listGlobal).toHaveBeenCalledOnce();
    expect(mocks.listAvailableForBook).toHaveBeenCalledWith('book-1');
    expect(mocks.create).toHaveBeenCalledWith(createData);
    expect(mocks.update).toHaveBeenCalledWith('preset-1', updateData);
    expect(mocks.delete).toHaveBeenCalledWith('preset-1');
    expect(mocks.listActivePresetIdsForBook).toHaveBeenCalledWith('book-1');
    expect(mocks.setActivePreset).toHaveBeenCalledWith('book-1', 'chat', 'preset-1');
    expect(mocks.resetActivePreset).toHaveBeenCalledWith('book-1', 'chat');
    expect(mocks.getBuiltInDefaultModelId).toHaveBeenCalledWith('default-summary');
    expect(mocks.setBuiltInDefaultModelId).toHaveBeenCalledWith(
      'default-summary',
      'openai/gpt-5',
    );
    expect(mocks.resolveActiveModel).toHaveBeenCalledWith('book-1', 'summary');
  });
});
