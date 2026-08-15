import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { ToastService } from '../../shared/services/toast.service';
import { Outline } from './outline';
import { OutlineStore } from './store/outline.store';

describe('Outline', () => {
  let component: Outline;
  let fixture: ComponentFixture<Outline>;
  let store: any;
  let toastService: Pick<ToastService, 'error'>;

  beforeEach(async () => {
    store = {
      bookId: signal('book-1'),
      isLoading: signal(false),
      error: signal(null),
      bookHierarchy: signal([]),
      enterBook: vi.fn().mockResolvedValue(undefined),
      createAct: vi.fn().mockResolvedValue(undefined),
      createChapter: vi.fn().mockResolvedValue(undefined),
      createScene: vi.fn().mockResolvedValue(undefined),
      deleteAct: vi.fn().mockResolvedValue(undefined),
      deleteChapter: vi.fn().mockResolvedValue(undefined),
      deleteScene: vi.fn().mockResolvedValue(undefined),
      archiveAct: vi.fn().mockResolvedValue(undefined),
      archiveChapter: vi.fn().mockResolvedValue(undefined),
      archiveScene: vi.fn().mockResolvedValue(undefined),
      updateAct: vi.fn().mockResolvedValue(undefined),
      updateChapter: vi.fn().mockResolvedValue(undefined),
      updateScene: vi.fn().mockResolvedValue(undefined),
      updateStructurePositions: vi.fn().mockResolvedValue(undefined),
    };

    toastService = {
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Outline],
      providers: [
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              paramMap: of(convertToParamMap({ bookId: 'book-1' })),
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn().mockResolvedValue(true),
          },
        },
        { provide: OutlineStore, useValue: store },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Outline);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the outline for the current book', () => {
    expect(store.enterBook).toHaveBeenCalledWith('book-1');
  });

  it('creates an act through the outline store', async () => {
    await component.createAct('book-1');

    expect(store.createAct).toHaveBeenCalledWith('book-1');
  });

  it('deletes an act through the outline store', async () => {
    await component.deleteAct('act-1');

    expect(store.deleteAct).toHaveBeenCalledWith('act-1');
  });

  it('archives a scene through the outline store', async () => {
    await component.archiveScene('scene-1');

    expect(store.archiveScene).toHaveBeenCalledWith('scene-1');
  });

  it('updates titles and scene summaries through the outline store', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);

    await component.updateActTitle('act-1', 'Renamed Act');
    await component.updateChapterTitle('chapter-1', 'Renamed Chapter');
    await component.updateSceneTitle('scene-1', 'Renamed Scene');
    await component.updateSceneSummary('scene-1', 'New scene summary');

    expect(store.updateAct).toHaveBeenCalledWith({ id: 'act-1', title: 'Renamed Act' });
    expect(store.updateChapter).toHaveBeenCalledWith({ id: 'chapter-1', title: 'Renamed Chapter' });
    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', title: 'Renamed Scene' });
    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', summary: 'New scene summary' });
  });

  it('skips unchanged title updates', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [],
      },
    ]);
    component.editing.set({ 'act-1': true });

    await component.updateActTitle('act-1', 'Act 1');

    expect(store.updateAct).not.toHaveBeenCalled();
    expect(component.editing()['act-1']).toBe(false);
  });

  it('normalizes whitespace-only edits to an empty string', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);

    await component.updateSceneSummary('scene-1', '   ');

    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', summary: '' });
  });

  it('shows update failures as toast errors and keeps edit mode open', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [],
      },
    ]);
    component.editing.set({ 'act-1': true });
    store.updateAct.mockRejectedValueOnce(new Error('Update exploded'));

    await component.updateActTitle('act-1', 'Renamed Act');

    expect(toastService.error).toHaveBeenCalledWith('Update exploded', 'Outline');
    expect(component.editing()['act-1']).toBe(true);
  });

  it('keeps scene editing active when focus moves from title to summary', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);
    const card = document.createElement('div');
    card.className = 'scene-card';
    const titleInput = document.createElement('input');
    const summaryInput = document.createElement('textarea');
    card.append(titleInput, summaryInput);

    await component.updateSceneTitle('scene-1', 'Renamed Scene', {
      target: titleInput,
      relatedTarget: summaryInput,
    } as unknown as FocusEvent);

    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', title: 'Renamed Scene' });
    expect(component.editing()['scene-1']).toBe(true);
  });

  it('saves act positions from the reordered drop data', async () => {
    await component.onActDrop({
      previousIndex: 0,
      currentIndex: 1,
      container: {
        data: [
          { id: 'act-1', bookId: 'book-1' },
          { id: 'act-2', bookId: 'book-1' },
        ],
      },
    } as any);

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      acts: [
        { id: 'act-2', bookId: 'book-1', position: 0 },
        { id: 'act-1', bookId: 'book-1', position: 1 },
      ],
    });
  });

  it('saves chapter positions for both source and target acts', async () => {
    await component.onChapterDrop({
      previousIndex: 0,
      currentIndex: 1,
      previousContainer: {
        id: 'outline-chapters-act-1',
        data: [{ id: 'chapter-1' }, { id: 'chapter-2' }],
      },
      container: {
        id: 'outline-chapters-act-2',
        data: [{ id: 'chapter-3' }],
      },
    } as any, 'act-2');

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      chapters: [
        { id: 'chapter-2', actId: 'act-1', position: 0 },
        { id: 'chapter-3', actId: 'act-2', position: 0 },
        { id: 'chapter-1', actId: 'act-2', position: 1 },
      ],
    });
  });

  it('saves scene positions for both source and target chapters', async () => {
    await component.onSceneDrop({
      previousIndex: 1,
      currentIndex: 0,
      previousContainer: {
        id: 'outline-scenes-chapter-1',
        data: [{ id: 'scene-1' }, { id: 'scene-2' }],
      },
      container: {
        id: 'outline-scenes-chapter-2',
        data: [{ id: 'scene-3' }],
      },
    } as any, 'chapter-2');

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      scenes: [
        { id: 'scene-1', chapterId: 'chapter-1', position: 0 },
        { id: 'scene-2', chapterId: 'chapter-2', position: 0 },
        { id: 'scene-3', chapterId: 'chapter-2', position: 1 },
      ],
    });
  });

  it('shows store failures as toast errors', async () => {
    store.createScene.mockRejectedValueOnce(new Error('Scene exploded'));

    await component.createScene('chapter-1');

    expect(toastService.error).toHaveBeenCalledWith('Scene exploded', 'Outline');
  });

  it('closes all open menus on scroll', () => {
    const mockTrigger1 = {
      isOpen: vi.fn().mockReturnValue(true),
      close: vi.fn(),
    };
    const mockTrigger2 = {
      isOpen: vi.fn().mockReturnValue(false),
      close: vi.fn(),
    };

    const queryList = {
      forEach: (callback: any) => [mockTrigger1, mockTrigger2].forEach(callback),
      some: (callback: any) => [mockTrigger1, mockTrigger2].some(callback),
    } as any;
    (component as any).menuTriggers = queryList;

    const scrollEvent = new Event('scroll');
    window.dispatchEvent(scrollEvent);

    expect(mockTrigger1.isOpen).toHaveBeenCalled();
    expect(mockTrigger1.close).toHaveBeenCalled();
    expect(mockTrigger2.isOpen).toHaveBeenCalled();
    expect(mockTrigger2.close).not.toHaveBeenCalled();
  });
});
