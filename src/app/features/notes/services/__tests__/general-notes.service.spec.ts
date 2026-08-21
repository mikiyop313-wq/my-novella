import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronService } from '../../../../core/services/electron.service';
import { GeneralNotesService } from '../general-notes.service';

describe('GeneralNotesService', () => {
  const invoke = vi.fn();
  let service: GeneralNotesService;

  beforeEach(() => {
    invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [
        GeneralNotesService,
        { provide: ElectronService, useValue: { invoke } },
      ],
    });
    service = TestBed.inject(GeneralNotesService);
  });

  it('uses the general-note IPC channels and payloads', async () => {
    invoke.mockResolvedValueOnce([]);
    await service.getNotes('book-1');
    expect(invoke).toHaveBeenLastCalledWith('notes:get', { bookId: 'book-1' });

    const createData = { bookId: 'book-1', title: '', content: '' };
    invoke.mockResolvedValueOnce({ id: 'note-1' });
    await service.createNote(createData);
    expect(invoke).toHaveBeenLastCalledWith('notes:create', { data: createData });

    const updateData = { title: 'Idea', content: 'Body' };
    invoke.mockResolvedValueOnce({ id: 'note-1' });
    await service.updateNote('note-1', updateData);
    expect(invoke).toHaveBeenLastCalledWith('notes:update', { id: 'note-1', data: updateData });

    invoke.mockResolvedValueOnce({ success: true });
    await service.deleteNote('note-1');
    expect(invoke).toHaveBeenLastCalledWith('notes:delete', { id: 'note-1' });
  });
});
