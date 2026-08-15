import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActDto } from '../../../../../shared/models/manuscript.model';
import { ManuscriptStructureService } from '../services/manuscript-structure.service';
import { WorkspaceBookStore } from '../workspace-book.store';

describe('WorkspaceBookStore', () => {
  let store: InstanceType<typeof WorkspaceBookStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceBookStore,
        {
          provide: ManuscriptStructureService,
          useValue: { getBookHierarchy: vi.fn() },
        },
      ],
    });
    store = TestBed.inject(WorkspaceBookStore);
    store.setBookHierarchy(hierarchy());
  });

  afterEach(() => TestBed.resetTestingModule());

  it('updates metadata in the cached hierarchy', () => {
    store.updateActMetadata({
      id: 'act-1',
      title: 'Updated act',
      summary: 'Updated act summary.',
    });
    store.updateChapterMetadata({ id: 'chapter-1', summary: 'Updated chapter summary.' });
    store.updateSceneMetadata({ id: 'scene-1', summary: 'Updated scene summary.' });

    const [act] = store.bookHierarchy();
    const [chapter] = act.chapters ?? [];
    const [scene] = chapter.scenes ?? [];

    expect(act.title).toBe('Updated act');
    expect(act.summary).toBe('Updated act summary.');
    expect(chapter.summary).toBe('Updated chapter summary.');
    expect(scene.summary).toBe('Updated scene summary.');
  });
});

function hierarchy(): ActDto[] {
  return [{
    id: 'act-1',
    bookId: 'book-1',
    title: 'Act One',
    position: 0,
    status: 'active',
    summary: '',
    chapters: [{
      id: 'chapter-1',
      actId: 'act-1',
      title: 'Chapter One',
      position: 0,
      status: 'active',
      summary: '',
      scenes: [{
        id: 'scene-1',
        chapterId: 'chapter-1',
        title: 'Scene One',
        position: 0,
        status: 'active',
        prose: null,
        summary: '',
        wordCount: 0,
        pointOfViewOverride: null,
        povCharacterIdOverride: null,
      }],
    }],
  }];
}
