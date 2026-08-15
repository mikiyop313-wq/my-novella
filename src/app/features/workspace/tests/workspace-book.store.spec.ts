import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ActDto,
  CreatedActStructureDto,
  CreatedChapterStructureDto,
  SceneDto,
} from '../../../../../shared/models/manuscript.model';
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

  it('appends a created act structure and recomputes context inclusion', () => {
    const created = createdActStructure();

    store.addActStructure(created);

    const [existingAct, addedAct] = store.bookHierarchy();
    expect(existingAct.id).toBe('act-1');
    expect(addedAct.id).toBe(created.act.id);
    expect(addedAct.chapters?.[0].id).toBe(created.chapter.id);
    expect(addedAct.chapters?.[0].scenes?.[0].id).toBe(created.scene.id);
    expect(addedAct.isIncludedInContext).toBe(true);
  });

  it('appends a created chapter structure to its act', () => {
    const created = createdChapterStructure();

    store.addChapterStructure(created);

    const [act] = store.bookHierarchy();
    expect(act.chapters?.map(chapter => chapter.id)).toEqual(['chapter-1', created.chapter.id]);
    expect(act.chapters?.[1].scenes?.[0].id).toBe(created.scene.id);
    expect(act.chapters?.[1].isIncludedInContext).toBe(true);
  });

  it('appends a created scene to its chapter', () => {
    const created = createdScene({ id: 'scene-2', chapterId: 'chapter-1', position: 1 });

    store.addScene(created);

    const [act] = store.bookHierarchy();
    expect(act.chapters?.[0].scenes?.map(scene => scene.id)).toEqual(['scene-1', created.id]);
    expect(act.chapters?.[0].isIncludedInContext).toBe(true);
    expect(act.isIncludedInContext).toBe(true);
  });

  it('does not change the hierarchy when a created entity has no cached parent', () => {
    const before = store.bookHierarchy();
    const chapterStructure = createdChapterStructure();
    chapterStructure.chapter.actId = 'missing-act';

    store.addChapterStructure(chapterStructure);
    store.addScene(createdScene({ chapterId: 'missing-chapter' }));

    expect(store.bookHierarchy()).toBe(before);
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

function createdActStructure(): CreatedActStructureDto {
  const chapterStructure = createdChapterStructure({ actId: 'act-2' });
  return {
    act: {
      id: 'act-2',
      bookId: 'book-1',
      title: '',
      position: 1,
      status: 'active',
      summary: null,
    },
    ...chapterStructure,
  };
}

function createdChapterStructure({ actId = 'act-1' }: { actId?: string } = {}): CreatedChapterStructureDto {
  const chapterId = actId === 'act-1' ? 'chapter-2' : 'chapter-3';
  return {
    chapter: {
      id: chapterId,
      actId,
      title: '',
      position: 1,
      status: 'active',
      summary: null,
    },
    scene: createdScene({ chapterId, position: 0 }),
  };
}

function createdScene({
  id = 'scene-new',
  chapterId = 'chapter-2',
  position = 0,
}: {
  id?: string;
  chapterId?: string;
  position?: number;
} = {}): SceneDto {
  return {
    id,
    chapterId,
    title: '',
    position,
    status: 'active',
    prose: null,
    summary: 'Ready for context.',
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}
