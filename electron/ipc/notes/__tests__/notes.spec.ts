import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getNotes: vi.fn(),
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

vi.mock('../../../../db/repositories/general-note.repository', () => ({
  generalNoteRepository: {
    getNotes: mocks.getNotes,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

import { setupGeneralNoteHandlers } from '../notes';

describe('general note IPC handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
    setupGeneralNoteHandlers();
  });

  it('registers and forwards all general-note payloads', async () => {
    const createData = { bookId: 'book-1', title: '', content: '' };
    const updateData = { title: 'Idea', content: 'Body' };

    await mocks.handlers.get('notes:get')?.({}, { bookId: 'book-1' });
    await mocks.handlers.get('notes:create')?.({}, { data: createData });
    await mocks.handlers.get('notes:update')?.({}, { id: 'note-1', data: updateData });
    await mocks.handlers.get('notes:delete')?.({}, { id: 'note-1' });

    expect(mocks.getNotes).toHaveBeenCalledWith('book-1');
    expect(mocks.create).toHaveBeenCalledWith(createData);
    expect(mocks.update).toHaveBeenCalledWith('note-1', updateData);
    expect(mocks.delete).toHaveBeenCalledWith('note-1');
  });
});
