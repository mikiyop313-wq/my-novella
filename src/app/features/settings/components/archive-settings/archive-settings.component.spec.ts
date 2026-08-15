import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActDto, ArchiveOverviewDto } from '../../../../../../shared/models/manuscript.model';
import { ConfirmModalService } from '../../../../shared/components/confirm-modal/confirm-modal.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { ArchiveSettingsComponent } from './archive-settings.component';

describe('ArchiveSettingsComponent', () => {
  let fixture: ComponentFixture<ArchiveSettingsComponent>;
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
        id: 'act-old',
        title: 'Archived Act',
        bookId: 'book-1',
        position: 2,
        status: 'archived',
        chapters: [
          {
            id: 'chapter-nested',
            title: 'Nested Chapter',
            actId: 'act-old',
            archiveParentTitle: 'Archived Act',
            position: 0,
            status: 'archived',
            scenes: [
              {
                id: 'scene-nested',
                title: '',
                chapterId: 'chapter-nested',
                archiveParentTitle: 'Nested Chapter',
                position: 0,
                status: 'archived',
              },
            ],
          },
        ],
      },
    ],
    archivedChapters: [
      {
        id: 'chapter-old',
        title: 'Archived Chapter',
        actId: 'act-1',
        archiveParentTitle: 'Active Act',
        position: 1,
        status: 'archived',
        scenes: [],
      },
    ],
    archivedScenes: [
      {
        id: 'scene-old',
        title: 'Archived Scene',
        chapterId: 'chapter-1',
        archiveParentTitle: 'Active Chapter',
        position: 1,
        status: 'archived',
      },
    ],
  };

  const hierarchy: ActDto[] = [
    {
      id: 'act-1',
      title: 'Active Act',
      bookId: 'book-1',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [
        {
          id: 'chapter-1',
          title: 'Active Chapter',
          actId: 'act-1',
          position: 0,
          status: 'active',
          summary: null,
          scenes: [],
        },
      ],
    },
  ];

  async function openActionsMenu(triggerLabel: string): Promise<HTMLElement> {
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      `[aria-label="${triggerLabel}"]`,
    );
    if (!trigger) throw new Error(`Missing archive menu trigger: ${triggerLabel}`);

    trigger.click();
    fixture.detectChanges();

    await vi.waitFor(() => {
      expect(document.querySelector('.overlay-menu')).not.toBeNull();
    });
    const menus = document.querySelectorAll<HTMLElement>('.overlay-menu');
    return menus[menus.length - 1];
  }

  beforeEach(async () => {
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

    await TestBed.configureTestingModule({
      imports: [ArchiveSettingsComponent],
      providers: [
        { provide: ManuscriptStructureService, useValue: outlineService },
        { provide: ToastService, useValue: { error: toastError } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArchiveSettingsComponent);
    fixture.componentRef.setInput('bookId', 'book-1');
    fixture.detectChanges();
    await fixture.componentInstance.store.load('book-1');
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders tab counts and the archived act hierarchy by default', () => {
    const element = fixture.nativeElement as HTMLElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    expect(outlineService.getArchiveOverview).toHaveBeenCalledWith('book-1');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toContain('1');
    expect(tabs[1].textContent).toContain('1');
    expect(tabs[2].textContent).toContain('1');
    expect(element.textContent).toContain('Archived Act');
    expect(element.textContent).toContain('Nested Chapter');
    expect(element.textContent).toContain('Untitled Scene');
  });

  it('switches tabs and identifies the active parent path for standalone items', () => {
    const element = fixture.nativeElement as HTMLElement;
    const tabs = element.querySelectorAll<HTMLButtonElement>('[role="tab"]');

    tabs[1].click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Chapter in Active Act');
    expect(element.textContent).toContain('Archived Chapter');

    tabs[2].click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Active Act / Active Chapter');
    expect(element.textContent).toContain('Archived Scene');
  });

  it('identifies deleted parents from the archive-time title snapshot', async () => {
    outlineService.getArchiveOverview.mockResolvedValueOnce({
      archivedActs: [],
      archivedChapters: [
        {
          id: 'detached-chapter',
          title: 'Preserved Chapter',
          actId: null,
          archiveParentTitle: 'Deleted Act',
          position: 2,
          status: 'archived',
          scenes: [],
        },
      ],
      archivedScenes: [
        {
          id: 'detached-scene',
          title: 'Preserved Scene',
          chapterId: null,
          archiveParentTitle: 'Deleted Chapter',
          position: 3,
          status: 'archived',
        },
      ],
    });
    await fixture.componentInstance.store.load('book-1');

    fixture.componentInstance.selectTab('chapters');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Previously in Deleted Act (deleted)',
    );

    fixture.componentInstance.selectTab('scenes');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Previously in Deleted Chapter (deleted)',
    );
  });

  it('restores a nested chapter into the selected active act', async () => {
    const component = fixture.componentInstance;

    component.beginTargetSelection('chapter', 'chapter-nested');
    component.updateTarget('act-1');
    await component.confirmTargetRestore();
    fixture.detectChanges();

    expect(outlineService.restoreChapter).toHaveBeenCalledWith('chapter-nested', 'act-1');
    expect(component.restoreSelection()).toBeNull();
    expect(component.selectedTargetId()).toBe('');
  });

  it('keeps the scene target selection when restoration fails', async () => {
    outlineService.restoreScene.mockRejectedValueOnce(new Error('Restore unavailable'));
    const component = fixture.componentInstance;

    component.beginTargetSelection('scene', 'scene-nested');
    component.updateTarget('chapter-1');
    await component.confirmTargetRestore();
    fixture.detectChanges();

    expect(component.restoreSelection()).toEqual({ type: 'scene', id: 'scene-nested' });
    expect(component.selectedTargetId()).toBe('chapter-1');
    expect(toastError).toHaveBeenCalledWith('Restore unavailable', 'Restore failed');
  });

  it('blocks chapter restoration when no active acts exist', async () => {
    outlineService.getBookHierarchy.mockResolvedValueOnce([]);
    await fixture.componentInstance.store.load('book-1');

    fixture.componentInstance.beginTargetSelection('chapter', 'chapter-nested');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No active acts exist. Restore or create an act first.',
    );
    expect(outlineService.restoreChapter).not.toHaveBeenCalled();
  });

  it('renders a tab-specific empty state', async () => {
    outlineService.getArchiveOverview.mockResolvedValueOnce({
      archivedActs: [],
      archivedChapters: [],
      archivedScenes: [],
    });
    await fixture.componentInstance.store.load('book-1');

    fixture.componentInstance.selectTab('scenes');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No archived scenes');
  });

  it('renders action-menu triggers for top-level and nested archive items', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('[data-archive-menu-trigger]')).toHaveLength(3);
    expect(element.querySelector('[aria-label="Actions for act Archived Act"]')).not.toBeNull();
    expect(
      element.querySelector('[aria-label="Actions for chapter Nested Chapter"]'),
    ).not.toBeNull();
    expect(element.querySelector('[aria-label="Actions for scene Untitled Scene"]')).not.toBeNull();

    fixture.componentInstance.selectTab('chapters');
    fixture.detectChanges();
    expect(
      element.querySelector('[aria-label="Actions for chapter Archived Chapter"]'),
    ).not.toBeNull();

    fixture.componentInstance.selectTab('scenes');
    fixture.detectChanges();
    expect(element.querySelector('[aria-label="Actions for scene Archived Scene"]')).not.toBeNull();
  });

  it('offers restore and delete in the item menu', async () => {
    const menu = await openActionsMenu('Actions for chapter Nested Chapter');

    expect(menu.querySelector('[data-archive-action="restore"]')?.textContent).toContain('Restore');
    expect(menu.querySelector('[data-archive-action="delete"]')?.textContent).toContain('Delete');

    menu.querySelector<HTMLButtonElement>('[data-archive-action="restore"]')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.restoreSelection()).toEqual({
      type: 'chapter',
      id: 'chapter-nested',
    });
  });

  it('requires confirmation with cascade details and leaves data untouched on cancel', async () => {
    const confirmService = TestBed.inject(ConfirmModalService);
    const menu = await openActionsMenu('Actions for act Archived Act');
    const deleteButton = menu.querySelector<HTMLButtonElement>('[data-archive-action="delete"]');

    deleteButton?.click();

    expect(confirmService.state().show).toBe(true);
    expect(confirmService.state().title).toBe('Delete archived act?');
    expect(confirmService.state().message).toContain(
      'all chapters, scenes, and manuscript content',
    );
    expect(confirmService.state().message).toContain('This cannot be undone.');

    confirmService.state().onCancel();

    expect(confirmService.state().show).toBe(false);
    expect(outlineService.deleteAct).not.toHaveBeenCalled();
  });

  it('deletes the confirmed item and refreshes it out of the archive', async () => {
    const confirmService = TestBed.inject(ConfirmModalService);
    outlineService.getArchiveOverview.mockResolvedValueOnce({
      archivedActs: [],
      archivedChapters: overview.archivedChapters,
      archivedScenes: overview.archivedScenes,
    });
    const menu = await openActionsMenu('Actions for act Archived Act');
    const deleteButton = menu.querySelector<HTMLButtonElement>('[data-archive-action="delete"]');

    deleteButton?.click();
    confirmService.state().onConfirm();

    await vi.waitFor(() => {
      expect(outlineService.deleteAct).toHaveBeenCalledWith('act-old');
      expect(fixture.componentInstance.store.archivedActs()).toEqual([]);
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No archived acts');
  });

  it('disables archive mutations and identifies the item while deletion is pending', async () => {
    let finishDelete!: () => void;
    outlineService.deleteAct.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      }),
    );
    const confirmService = TestBed.inject(ConfirmModalService);
    const menu = await openActionsMenu('Actions for act Archived Act');
    const deleteButton = menu.querySelector<HTMLButtonElement>('[data-archive-action="delete"]');
    const actTrigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[aria-label="Actions for act Archived Act"]',
    );

    deleteButton?.click();
    confirmService.state().onConfirm();
    await vi.waitFor(() => expect(fixture.componentInstance.store.isDeleting()).toBe(true));
    fixture.detectChanges();

    const menuTriggers = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[data-archive-menu-trigger]',
    );
    expect([...menuTriggers].every((button) => button.disabled)).toBe(true);
    expect(actTrigger?.getAttribute('aria-label')).toBe('Deleting act Archived Act');
    expect(actTrigger?.getAttribute('data-busy')).toBe('true');

    finishDelete();
    await vi.waitFor(() => expect(fixture.componentInstance.store.isBusy()).toBe(false));
  });
});
