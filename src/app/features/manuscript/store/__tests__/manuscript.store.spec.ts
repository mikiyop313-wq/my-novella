import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { type Mock, vi } from 'vitest';

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
  let workspaceBookStore: {
    bookHierarchy: WritableSignal<ActDto[]>;
    addActStructure: ReturnType<typeof vi.fn>;
    addChapterStructure: ReturnType<typeof vi.fn>;
    addScene: ReturnType<typeof vi.fn>;
  };
  let runInsertion: ReturnType<typeof vi.fn>;
  let insertContentAt: Mock<(...args: unknown[]) => void>;

  beforeEach(() => {
    manuscriptStructureService = {
      createActStructure: vi.fn(),
      createChapterStructure: vi.fn(),
      createScene: vi.fn(),
    };
    workspaceBookStore = {
      bookHierarchy: signal<ActDto[]>([]),
      addActStructure: vi.fn(),
      addChapterStructure: vi.fn(),
      addScene: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ManuscriptStore,
        { provide: ElectronService, useValue: { invoke: vi.fn() } },
        {
          provide: WorkspaceBookStore,
          useValue: workspaceBookStore,
        },
        { provide: ManuscriptStructureService, useValue: manuscriptStructureService },
      ],
    });

    store = TestBed.inject(ManuscriptStore);
    runInsertion = vi.fn();
    insertContentAt = vi.fn<(...args: unknown[]) => void>();
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
    expect(workspaceBookStore.addScene).not.toHaveBeenCalled();
  });

  it('replaces the empty-book placeholder when inserting the first act structure', async () => {
    const created = {
      act: createAct(),
      chapter: createChapter('act-new'),
      scene: createScene('chapter-new'),
    };
    manuscriptStructureService.createActStructure.mockResolvedValue(created);
    store.setRouteParams('book', 'book-1');
    store.setEditor(createEditor({
      chapterId: 'chapter-a',
      documentShape: 'empty-placeholder',
      insertContentAt,
      runInsertion,
    }));

    await store.insertAct();

    expect(manuscriptStructureService.createActStructure).toHaveBeenCalledWith('book-1');
    expect(insertContentAt).toHaveBeenCalledWith(
      { from: 0, to: 2 },
      [
        { type: 'actHeader', attrs: { id: 'act-new', title: '', position: 1 } },
        { type: 'chapterHeader', attrs: { id: 'chapter-new', title: '', position: 0 } },
        { type: 'sceneSummary', attrs: { id: 'scene-new', title: 'New Scene', summary: '', position: 1 } },
        { type: 'paragraph' },
      ],
      { updateSelection: true },
    );
    expect(runInsertion).toHaveBeenCalledOnce();
    expect(workspaceBookStore.addActStructure).toHaveBeenCalledWith(created);
  });

  it('appends an act structure when the document already contains structure', async () => {
    manuscriptStructureService.createActStructure.mockResolvedValue({
      act: createAct(),
      chapter: createChapter('act-new'),
      scene: createScene('chapter-new'),
    });
    store.setRouteParams('book', 'book-1');
    store.setEditor(createEditor({ chapterId: 'chapter-a', insertContentAt, runInsertion }));

    await store.insertAct();

    expect(insertContentAt).toHaveBeenCalledWith(
      10,
      expect.any(Array),
      { updateSelection: true },
    );
  });

  it('creates and inserts a chapter structure with one service operation', async () => {
    const created = {
      chapter: createChapter('act-a'),
      scene: createScene('chapter-new'),
    };
    manuscriptStructureService.createChapterStructure.mockResolvedValue(created);
    store.setRouteParams('act', 'act-a');
    store.setEditor(createEditor({ actId: 'act-a', chapterId: 'chapter-a', runInsertion }));

    await store.insertChapter();

    expect(manuscriptStructureService.createChapterStructure).toHaveBeenCalledWith('act-a');
    expect(runInsertion).toHaveBeenCalledOnce();
    expect(workspaceBookStore.addChapterStructure).toHaveBeenCalledWith(created);
  });

  it('inserts a created scene when the active entity has not changed', async () => {
    const created = createScene('chapter-a');
    manuscriptStructureService.createScene.mockResolvedValue(created);

    store.setRouteParams('chapter', 'chapter-a');
    store.setEditor(createEditor({ chapterId: 'chapter-a', runInsertion }));

    await store.insertScene();

    expect(runInsertion).toHaveBeenCalledOnce();
    expect(workspaceBookStore.addScene).toHaveBeenCalledWith(created);
  });
});

interface CreateEditorOptions {
  actId?: string;
  chapterId: string;
  documentShape?: 'empty-placeholder' | 'structured';
  insertContentAt?: (...args: unknown[]) => void;
  runInsertion: ReturnType<typeof vi.fn>;
}

function createEditor({
  actId,
  chapterId,
  documentShape = 'structured',
  insertContentAt = vi.fn(),
  runInsertion,
}: CreateEditorOptions): Editor {
  const chain = {
    focus: vi.fn(() => chain),
    command: vi.fn(() => chain),
    insertContentAt: vi.fn((...args: unknown[]) => {
      insertContentAt(...args);
      return chain;
    }),
    run: runInsertion,
  };
  const isEmptyPlaceholder = documentShape === 'empty-placeholder';

  return {
    state: {
      doc: {
        childCount: isEmptyPlaceholder ? 1 : 4,
        content: { size: isEmptyPlaceholder ? 2 : 10 },
        firstChild: isEmptyPlaceholder
          ? { type: { name: 'paragraph' }, content: { size: 0 } }
          : { type: { name: 'actHeader' }, content: { size: 0 } },
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

function createChapter(actId: string): ChapterDto {
  return {
    id: 'chapter-new',
    actId,
    title: '',
    position: 0,
  } as ChapterDto;
}

function createScene(chapterId = 'chapter-a'): SceneDto {
  return {
    id: 'scene-new',
    chapterId,
    title: 'New Scene',
    summary: '',
    position: 1,
  } as SceneDto;
}
