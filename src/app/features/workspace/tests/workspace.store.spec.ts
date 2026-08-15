import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryService } from '../../library/services/library.service';
import { WorkspaceStore } from '../workspace.store';

describe('WorkspaceStore manuscript routes', () => {
  let store: InstanceType<typeof WorkspaceStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceStore,
        { provide: LibraryService, useValue: { getBooks: vi.fn() } },
      ],
    });
    store = TestBed.inject(WorkspaceStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it.each(['act', 'chapter', 'scene'] as const)(
    'resets a matching %s route to the full novel',
    (mode) => {
      store.rememberManuscriptRoute('book-1', { mode, id: `${mode}-1` });

      store.resetLastManuscriptRouteForRemovedEntity({
        bookId: 'book-1',
        mode,
        id: `${mode}-1`,
      });

      expect(store.getLastManuscriptRoute('book-1')).toEqual({
        mode: 'book',
        id: 'book-1',
      });
    },
  );

  it('leaves different entity, mode, and book routes unchanged', () => {
    store.rememberManuscriptRoute('book-1', { mode: 'scene', id: 'scene-1' });
    store.rememberManuscriptRoute('book-2', { mode: 'act', id: 'act-2' });

    store.resetLastManuscriptRouteForRemovedEntity({
      bookId: 'book-1',
      mode: 'scene',
      id: 'scene-2',
    });
    store.resetLastManuscriptRouteForRemovedEntity({
      bookId: 'book-1',
      mode: 'chapter',
      id: 'scene-1',
    });

    expect(store.getLastManuscriptRoute('book-1')).toEqual({ mode: 'scene', id: 'scene-1' });
    expect(store.getLastManuscriptRoute('book-2')).toEqual({ mode: 'act', id: 'act-2' });
  });
});
