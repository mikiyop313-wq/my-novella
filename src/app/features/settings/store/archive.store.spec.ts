import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActDto, ArchiveOverviewDto } from '../../../../../shared/models/manuscript.model';
import { ToastService } from '../../../shared/services/toast.service';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';
import { ArchiveStore } from './archive.store';

describe('ArchiveStore', () => {
  let store: InstanceType<typeof ArchiveStore>;
  let outlineService: {
    getArchiveOverview: ReturnType<typeof vi.fn>;
    getBookHierarchy: ReturnType<typeof vi.fn>;
    restoreAct: ReturnType<typeof vi.fn>;
    restoreChapter: ReturnType<typeof vi.fn>;
    restoreScene: ReturnType<typeof vi.fn>;
    deleteAct: ReturnType<typeof vi.fn>;
    deleteChapter: ReturnType<typeof vi.fn>;
    deleteScene: ReturnType<typeof vi.fn>;
  };
  let toastError: ReturnType<typeof vi.fn>;

  const overview: ArchiveOverviewDto = {
    archivedActs: [
      {
        id: 'archived-act',
        title: 'Old Act',
        bookId: 'book-1',
        position: 0,
        status: 'archived',
        chapters: [],
      },
    ],
    archivedChapters: [],
    archivedScenes: [],
  };

  const hierarchy: ActDto[] = [
    {
      id: 'act-1',
      title: 'Act One',
      bookId: 'book-1',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [
        {
          id: 'chapter-1',
          title: 'Chapter One',
          actId: 'act-1',
          position: 0,
          status: 'active',
          summary: null,
          scenes: [],
        },
      ],
    },
  ];

  beforeEach(() => {
    outlineService = {
      getArchiveOverview: vi.fn().mockResolvedValue(overview),
      getBookHierarchy: vi.fn().mockResolvedValue(hierarchy),
      restoreAct: vi.fn().mockResolvedValue(undefined),
      restoreChapter: vi.fn().mockResolvedValue(undefined),
      restoreScene: vi.fn().mockResolvedValue(undefined),
      deleteAct: vi.fn().mockResolvedValue(undefined),
      deleteChapter: vi.fn().mockResolvedValue(undefined),
      deleteScene: vi.fn().mockResolvedValue(undefined),
    };
    toastError = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ArchiveStore,
        { provide: ManuscriptStructureService, useValue: outlineService },
        { provide: ToastService, useValue: { error: toastError } },
      ],
    });

    store = TestBed.inject(ArchiveStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads archive groups and derives active restore targets', async () => {
    await store.load('book-1');

    expect(outlineService.getArchiveOverview).toHaveBeenCalledWith('book-1');
    expect(outlineService.getBookHierarchy).toHaveBeenCalledWith('book', 'book-1');
    expect(store.archivedActs()).toEqual(overview.archivedActs);
    expect(store.activeActOptions()).toEqual([{ value: 'act-1', label: 'Act One' }]);
    expect(store.activeChapterSections()).toEqual([
      {
        key: 'act-act-1',
        title: 'Act One',
        options: [{ value: 'chapter-1', label: 'Chapter One' }],
      },
    ]);
    expect(store.loadError()).toBeNull();
  });

  it('exposes a retryable load error and clears stale archive data', async () => {
    outlineService.getArchiveOverview.mockRejectedValueOnce(new Error('Database unavailable'));

    await store.load('book-1');

    expect(store.isLoading()).toBe(false);
    expect(store.archivedActs()).toEqual([]);
    expect(store.activeHierarchy()).toEqual([]);
    expect(store.loadError()).toBe('Database unavailable');
  });

  it('restores an item and refreshes archive and target data', async () => {
    await store.load('book-1');

    const restored = await store.restoreChapter('chapter-old', 'act-1');

    expect(restored).toBe(true);
    expect(outlineService.restoreChapter).toHaveBeenCalledWith('chapter-old', 'act-1');
    expect(outlineService.getArchiveOverview).toHaveBeenCalledTimes(2);
    expect(outlineService.getBookHierarchy).toHaveBeenCalledTimes(2);
    expect(store.restoringKey()).toBeNull();
  });

  it('blocks duplicate restore actions while one is in progress', async () => {
    await store.load('book-1');
    let finishRestore!: () => void;
    outlineService.restoreAct.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRestore = resolve;
      }),
    );

    const firstRestore = store.restoreAct('archived-act');
    const duplicateResult = await store.restoreAct('archived-act');

    expect(duplicateResult).toBe(false);
    expect(outlineService.restoreAct).toHaveBeenCalledOnce();

    finishRestore();
    await expect(firstRestore).resolves.toBe(true);
  });

  it('reports restore failures and restores the idle state', async () => {
    await store.load('book-1');
    outlineService.restoreScene.mockRejectedValueOnce(new Error('Target is no longer active'));

    const restored = await store.restoreScene('scene-old', 'chapter-1');

    expect(restored).toBe(false);
    expect(store.restoringKey()).toBeNull();
    expect(toastError).toHaveBeenCalledWith('Target is no longer active', 'Restore failed');
  });

  it('keeps a successful restore successful when the follow-up refresh fails', async () => {
    await store.load('book-1');
    outlineService.getArchiveOverview.mockRejectedValueOnce(new Error('Refresh unavailable'));

    const restored = await store.restoreAct('archived-act');

    expect(restored).toBe(true);
    expect(outlineService.restoreAct).toHaveBeenCalledWith('archived-act');
    expect(toastError).toHaveBeenCalledWith('Refresh unavailable', 'Archive refresh failed');
  });

  it('deletes each entity type and refreshes the archive data', async () => {
    await store.load('book-1');

    await expect(store.deleteAct('archived-act')).resolves.toBe(true);
    await expect(store.deleteChapter('chapter-old')).resolves.toBe(true);
    await expect(store.deleteScene('scene-old')).resolves.toBe(true);

    expect(outlineService.deleteAct).toHaveBeenCalledWith('archived-act');
    expect(outlineService.deleteChapter).toHaveBeenCalledWith('chapter-old');
    expect(outlineService.deleteScene).toHaveBeenCalledWith('scene-old');
    expect(outlineService.getArchiveOverview).toHaveBeenCalledTimes(4);
    expect(outlineService.getBookHierarchy).toHaveBeenCalledTimes(4);
    expect(store.deletingKey()).toBeNull();
  });

  it('blocks restore and duplicate delete actions while a delete is in progress', async () => {
    await store.load('book-1');
    let finishDelete!: () => void;
    outlineService.deleteAct.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      }),
    );

    const firstDelete = store.deleteAct('archived-act');

    expect(store.deletingKey()).toBe('act:archived-act');
    expect(store.isBusy()).toBe(true);
    await expect(store.restoreAct('archived-act')).resolves.toBe(false);
    await expect(store.deleteScene('scene-old')).resolves.toBe(false);
    expect(outlineService.restoreAct).not.toHaveBeenCalled();
    expect(outlineService.deleteScene).not.toHaveBeenCalled();

    finishDelete();
    await expect(firstDelete).resolves.toBe(true);
    expect(store.isBusy()).toBe(false);
  });

  it('reports delete failures and restores the idle state', async () => {
    await store.load('book-1');
    outlineService.deleteScene.mockRejectedValueOnce(new Error('Delete unavailable'));

    const deleted = await store.deleteScene('scene-old');

    expect(deleted).toBe(false);
    expect(store.deletingKey()).toBeNull();
    expect(store.isBusy()).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Delete unavailable', 'Delete failed');
    expect(outlineService.getArchiveOverview).toHaveBeenCalledOnce();
  });
});
