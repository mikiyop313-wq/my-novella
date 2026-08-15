import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ActDto, ChapterDto, SceneDto } from '../../../../../shared/models/manuscript.model';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';
import { OutlineStore } from './outline.store';

function makeScene(overrides: Partial<SceneDto> = {}): SceneDto {
  return {
    id: 'scene-1',
    title: 'Scene 1',
    chapterId: 'chapter-1',
    position: 0,
    status: 'active',
    prose: null,
    summary: 'Scene summary',
    wordCount: 100,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
    ...overrides,
  };
}

function makeChapter(overrides: Partial<ChapterDto> = {}): ChapterDto {
  return {
    id: 'chapter-1',
    title: 'Chapter 1',
    actId: 'act-1',
    position: 0,
    status: 'active',
    summary: 'Chapter summary',
    scenes: [makeScene()],
    ...overrides,
  };
}

function makeAct(overrides: Partial<ActDto> = {}): ActDto {
  return {
    id: 'act-1',
    title: 'Act 1',
    bookId: 'book-1',
    position: 0,
    status: 'active',
    summary: 'Act summary',
    chapters: [makeChapter()],
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('OutlineStore', () => {
  let store: InstanceType<typeof OutlineStore>;
  let outlineService: {
    getOutline: ReturnType<typeof vi.fn>;
    createAct: ReturnType<typeof vi.fn>;
    createChapter: ReturnType<typeof vi.fn>;
    createScene: ReturnType<typeof vi.fn>;
    deleteAct: ReturnType<typeof vi.fn>;
    deleteChapter: ReturnType<typeof vi.fn>;
    deleteScene: ReturnType<typeof vi.fn>;
    archiveAct: ReturnType<typeof vi.fn>;
    archiveChapter: ReturnType<typeof vi.fn>;
    archiveScene: ReturnType<typeof vi.fn>;
    updateAct: ReturnType<typeof vi.fn>;
    updateChapter: ReturnType<typeof vi.fn>;
    updateScene: ReturnType<typeof vi.fn>;
    updateStructurePositions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    outlineService = {
      getOutline: vi.fn(),
      createAct: vi.fn(),
      createChapter: vi.fn(),
      createScene: vi.fn(),
      deleteAct: vi.fn(),
      deleteChapter: vi.fn(),
      deleteScene: vi.fn(),
      archiveAct: vi.fn(),
      archiveChapter: vi.fn(),
      archiveScene: vi.fn(),
      updateAct: vi.fn(),
      updateChapter: vi.fn(),
      updateScene: vi.fn(),
      updateStructurePositions: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        OutlineStore,
        { provide: ManuscriptStructureService, useValue: outlineService },
      ],
    });

    store = TestBed.inject(OutlineStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads a summary-rich outline tree', async () => {
    const outline = [makeAct()];
    outlineService.getOutline.mockResolvedValueOnce(outline);

    await store.enterBook('book-1');

    expect(outlineService.getOutline).toHaveBeenCalledWith('book-1');
    expect(store.bookHierarchy()[0].summary).toBe('Act summary');
    expect(store.bookHierarchy()[0].chapters?.[0].summary).toBe('Chapter summary');
    expect(store.bookHierarchy()[0].chapters?.[0].scenes?.[0].summary).toBe('Scene summary');
  });

  it('appends a created act only after IPC success', async () => {
    const createAct = deferred<ActDto>();
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.createAct.mockReturnValueOnce(createAct.promise);

    const request = store.createAct('book-1');

    expect(store.bookHierarchy()).toHaveLength(1);

    createAct.resolve(makeAct({ id: 'act-2', title: 'Act 2', position: 1, chapters: undefined }));
    await request;

    expect(store.bookHierarchy()).toHaveLength(2);
    expect(store.bookHierarchy()[1]).toMatchObject({ id: 'act-2', chapters: [] });
  });

  it('appends created chapters and scenes under their parents', async () => {
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.createChapter.mockResolvedValueOnce(makeChapter({
      id: 'chapter-2',
      title: 'Chapter 2',
      position: 1,
      scenes: undefined,
    }));
    outlineService.createScene.mockResolvedValueOnce(makeScene({
      id: 'scene-2',
      title: 'Scene 2',
      chapterId: 'chapter-2',
      position: 0,
    }));

    await store.createChapter('act-1');
    await store.createScene('chapter-2');

    const chapter = store.bookHierarchy()[0].chapters?.[1];
    expect(chapter).toMatchObject({ id: 'chapter-2', scenes: [{ id: 'scene-2' }] });
  });

  it('does not mutate the outline when create fails', async () => {
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.createScene.mockRejectedValueOnce(new Error('Create failed'));

    await expect(store.createScene('chapter-1')).rejects.toThrow('Create failed');

    expect(store.bookHierarchy()[0].chapters?.[0].scenes).toHaveLength(1);
  });

  it('removes deleted and archived items after IPC success', async () => {
    outlineService.getOutline.mockResolvedValueOnce([
      makeAct({
        chapters: [
          makeChapter(),
          makeChapter({
            id: 'chapter-2',
            title: 'Chapter 2',
            position: 1,
            scenes: [
              makeScene({ id: 'scene-2', chapterId: 'chapter-2', position: 0 }),
              makeScene({ id: 'scene-3', chapterId: 'chapter-2', position: 1 }),
            ],
          }),
        ],
      }),
    ]);
    await store.enterBook('book-1');
    outlineService.deleteChapter.mockResolvedValueOnce(undefined);
    outlineService.archiveScene.mockResolvedValueOnce(undefined);

    await store.deleteChapter('chapter-1');
    await store.archiveScene('scene-2');

    const remainingChapter = store.bookHierarchy()[0].chapters?.[0];
    expect(remainingChapter).toMatchObject({ id: 'chapter-2', position: 0 });
    expect(remainingChapter?.scenes).toMatchObject([{ id: 'scene-3', position: 0 }]);
  });

  it('does not remove an item when delete fails', async () => {
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.deleteAct.mockRejectedValueOnce(new Error('Delete failed'));

    await expect(store.deleteAct('act-1')).rejects.toThrow('Delete failed');

    expect(store.bookHierarchy()).toHaveLength(1);
    expect(store.bookHierarchy()[0].id).toBe('act-1');
  });

  it('updates titles and summaries after IPC success while preserving nested children', async () => {
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.updateAct.mockResolvedValueOnce(makeAct({
      title: 'Ignored Act Return',
      summary: 'Ignored Act Summary',
      chapters: undefined,
    }));
    outlineService.updateChapter.mockResolvedValueOnce(makeChapter({
      title: 'Ignored Chapter Return',
      summary: 'Ignored Chapter Summary',
      scenes: undefined,
    }));
    outlineService.updateScene.mockResolvedValueOnce(makeScene({
      title: 'Ignored Scene Return',
      summary: 'Ignored Scene Summary',
    }));

    await store.updateAct({ id: 'act-1', title: 'Renamed Act', summary: 'New act summary' });
    await store.updateChapter({ id: 'chapter-1', title: 'Renamed Chapter', summary: 'New chapter summary' });
    await store.updateScene({ id: 'scene-1', title: 'Renamed Scene', summary: 'New scene summary' });

    const act = store.bookHierarchy()[0];
    const chapter = act.chapters?.[0];
    const scene = chapter?.scenes?.[0];
    expect(outlineService.updateAct).toHaveBeenCalledWith({
      id: 'act-1',
      title: 'Renamed Act',
      summary: 'New act summary',
    });
    expect(act).toMatchObject({
      title: 'Renamed Act',
      summary: 'New act summary',
      chapters: [{ id: 'chapter-1' }],
    });
    expect(chapter).toMatchObject({
      title: 'Renamed Chapter',
      summary: 'New chapter summary',
      scenes: [{ id: 'scene-1' }],
    });
    expect(scene).toMatchObject({
      title: 'Renamed Scene',
      summary: 'New scene summary',
    });
  });

  it('does not mutate metadata when update persistence fails', async () => {
    outlineService.getOutline.mockResolvedValueOnce([makeAct()]);
    await store.enterBook('book-1');
    outlineService.updateScene.mockRejectedValueOnce(new Error('Update failed'));

    await expect(store.updateScene({ id: 'scene-1', summary: 'Changed summary' }))
      .rejects.toThrow('Update failed');

    expect(store.bookHierarchy()[0].chapters?.[0].scenes?.[0]).toMatchObject({
      title: 'Scene 1',
      summary: 'Scene summary',
    });
  });

  it('updates structure positions only after persistence succeeds', async () => {
    const updatePositions = deferred<void>();
    outlineService.getOutline.mockResolvedValueOnce([
      makeAct({ id: 'act-1', position: 0 }),
      makeAct({ id: 'act-2', title: 'Act 2', position: 1, chapters: [] }),
    ]);
    outlineService.updateStructurePositions.mockReturnValueOnce(updatePositions.promise);
    await store.enterBook('book-1');

    const request = store.updateStructurePositions({
      acts: [
        { id: 'act-2', bookId: 'book-1', position: 0 },
        { id: 'act-1', bookId: 'book-1', position: 1 },
      ],
    });

    expect(store.bookHierarchy()).toMatchObject([
      { id: 'act-1', position: 0 },
      { id: 'act-2', position: 1 },
    ]);

    updatePositions.resolve(undefined);
    await request;

    expect(store.bookHierarchy()).toMatchObject([
      { id: 'act-2', position: 0 },
      { id: 'act-1', position: 1 },
    ]);
  });

  it('moves chapters and scenes from saved structure positions', async () => {
    outlineService.getOutline.mockResolvedValueOnce([
      makeAct({
        id: 'act-1',
        chapters: [
          makeChapter({
            id: 'chapter-1',
            actId: 'act-1',
            position: 0,
            scenes: [
              makeScene({ id: 'scene-1', chapterId: 'chapter-1', position: 0 }),
              makeScene({ id: 'scene-2', chapterId: 'chapter-1', position: 1 }),
            ],
          }),
        ],
      }),
      makeAct({
        id: 'act-2',
        title: 'Act 2',
        position: 1,
        chapters: [
          makeChapter({
            id: 'chapter-2',
            actId: 'act-2',
            position: 0,
            scenes: [
              makeScene({ id: 'scene-3', chapterId: 'chapter-2', position: 0 }),
            ],
          }),
        ],
      }),
    ]);
    outlineService.updateStructurePositions.mockResolvedValueOnce(undefined);
    await store.enterBook('book-1');

    await store.updateStructurePositions({
      chapters: [
        { id: 'chapter-1', actId: 'act-2', position: 1 },
        { id: 'chapter-2', actId: 'act-2', position: 0 },
      ],
      scenes: [
        { id: 'scene-1', chapterId: 'chapter-1', position: 0 },
        { id: 'scene-2', chapterId: 'chapter-2', position: 0 },
        { id: 'scene-3', chapterId: 'chapter-2', position: 1 },
      ],
    });

    expect(store.bookHierarchy()[0].chapters).toEqual([]);
    expect(store.bookHierarchy()[1].chapters).toMatchObject([
      { id: 'chapter-2', actId: 'act-2', position: 0 },
      { id: 'chapter-1', actId: 'act-2', position: 1 },
    ]);
    expect(store.bookHierarchy()[1].chapters?.[0].scenes).toMatchObject([
      { id: 'scene-2', chapterId: 'chapter-2', position: 0 },
      { id: 'scene-3', chapterId: 'chapter-2', position: 1 },
    ]);
  });

  it('does not change structure positions when persistence fails', async () => {
    outlineService.getOutline.mockResolvedValueOnce([
      makeAct({ id: 'act-1', position: 0 }),
      makeAct({ id: 'act-2', title: 'Act 2', position: 1, chapters: [] }),
    ]);
    outlineService.updateStructurePositions.mockRejectedValueOnce(new Error('Move failed'));
    await store.enterBook('book-1');

    await expect(store.updateStructurePositions({
      acts: [
        { id: 'act-2', bookId: 'book-1', position: 0 },
        { id: 'act-1', bookId: 'book-1', position: 1 },
      ],
    })).rejects.toThrow('Move failed');

    expect(store.bookHierarchy()).toMatchObject([
      { id: 'act-1', position: 0 },
      { id: 'act-2', position: 1 },
    ]);
  });
});
