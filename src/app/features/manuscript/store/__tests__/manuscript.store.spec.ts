import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { vi } from 'vitest';

import { ElectronService } from '../../../../core/services/electron.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import type { ActDto, ChapterDto, SceneDto } from '../../../../../../shared/models/manuscript.model';
import { ManuscriptStore } from '../manuscript.store';

describe('ManuscriptStore structural insertion', () => {
  let store: InstanceType<typeof ManuscriptStore>;
  let manuscriptStructureService: {
    createActStructure: ReturnType<typeof vi.fn>;
    createChapterStructure: ReturnType<typeof vi.fn>;
    createScene: ReturnType<typeof vi.fn>;
  };
  let runInsertion: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manuscriptStructureService = {
      createActStructure: vi.fn(),
      createChapterStructure: vi.fn(),
      createScene: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ManuscriptStore,
        { provide: ElectronService, useValue: { invoke: vi.fn() } },
        {
          provide: WorkspaceBookStore,
          useValue: {
            bookHierarchy: signal([]),
          },
        },
        { provide: ManuscriptStructureService, useValue: manuscriptStructureService },
      ],
    });

    store = TestBed.inject(ManuscriptStore);
    runInsertion = vi.fn();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not insert a created scene after navigation to another entity', async () => {
    let finishCreation!: (scene: SceneDto) => void;
    manuscriptStructureService.createScene.mockReturnValue(new Promise<SceneDto>(resolve => {
      finishCreation = resolve;
    }));

    store.setRouteParams('chapter', 'chapter-a');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    const insertion = store.insertScene();
    store.setRouteParams('chapter', 'chapter-b');
    finishCreation(createScene());

    await insertion;

    expect(manuscriptStructureService.createScene).toHaveBeenCalledWith('chapter-a');
    expect(runInsertion).not.toHaveBeenCalled();
  });

  it('creates and inserts an act structure with one service operation', async () => {
    manuscriptStructureService.createActStructure.mockResolvedValue({
      act: createAct(),
      chapter: createChapter(),
      scene: createScene(),
    });
    store.setRouteParams('book', 'book-1');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    await store.insertAct();

    expect(manuscriptStructureService.createActStructure).toHaveBeenCalledWith('book-1');
    expect(runInsertion).toHaveBeenCalledOnce();
  });

  it('creates and inserts a chapter structure with one service operation', async () => {
    manuscriptStructureService.createChapterStructure.mockResolvedValue({
      chapter: createChapter(),
      scene: createScene(),
    });
    store.setRouteParams('act', 'act-a');
    store.setEditor(createEditor({ actId: 'act-a', chapterId: 'chapter-a', runInsertion }));

    await store.insertChapter();

    expect(manuscriptStructureService.createChapterStructure).toHaveBeenCalledWith('act-a');
    expect(runInsertion).toHaveBeenCalledOnce();
  });

  it('inserts a created scene when the active entity has not changed', async () => {
    manuscriptStructureService.createScene.mockResolvedValue(createScene());

    store.setRouteParams('chapter', 'chapter-a');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    await store.insertScene();

    expect(runInsertion).toHaveBeenCalledOnce();
  });
});

interface CreateEditorOptions {
  actId?: string;
  chapterId: string;
  runInsertion: ReturnType<typeof vi.fn>;
}

function createEditor({ actId, chapterId, runInsertion }: CreateEditorOptions): Editor {
  const chain = {
    focus: vi.fn(() => chain),
    command: vi.fn(() => chain),
    insertContentAt: vi.fn(() => chain),
    run: runInsertion,
  };

  return {
    state: {
      doc: {
        content: { size: 10 },
        descendants: (visitor: (node: { type: { name: string }; attrs: Record<string, string> }) => void) => {
          if (actId) visitor({ type: { name: 'actHeader' }, attrs: { id: actId } });
          visitor({ type: { name: 'chapterHeader' }, attrs: { id: chapterId } });
        },
      },
    },
    chain: () => chain,
  } as unknown as Editor;
}

function createAct(): ActDto {
  return {
    id: 'act-new',
    bookId: 'book-1',
    title: '',
    position: 1,
  } as ActDto;
}

function createChapter(): ChapterDto {
  return {
    id: 'chapter-new',
    actId: 'act-new',
    title: '',
    position: 0,
  } as ChapterDto;
}

function createScene(): SceneDto {
  return {
    id: 'scene-new',
    title: 'New Scene',
    summary: '',
    position: 1,
  } as SceneDto;
}
