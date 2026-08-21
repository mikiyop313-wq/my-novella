import { OverlayContainer } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneralNoteDto } from '../../../../../../../shared/models/general-note.model';
import { ElectronService } from '../../../../../core/services/electron.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { GeneralNotesService } from '../../../services/general-notes.service';
import { GeneralNotesSidebarSection } from '../general-notes-sidebar-section';

describe('GeneralNotesSidebarSection', () => {
  let fixture: ComponentFixture<GeneralNotesSidebarSection>;
  let component: GeneralNotesSidebarSection;
  let overlayContainer: OverlayContainer;
  const sidebarOpen = signal(true);
  const bookId = signal<string | null>('book-1');
  const notesService = {
    getNotes: vi.fn<() => Promise<GeneralNoteDto[]>>(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  };
  const toastService = { error: vi.fn() };
  const electronService = {
    onBeforeClose: vi.fn(),
    removeBeforeCloseHandler: vi.fn(),
  };
  let nextNoteId = 0;

  beforeEach(async () => {
    sidebarOpen.set(true);
    bookId.set('book-1');
    nextNoteId = 0;
    vi.clearAllMocks();
    notesService.getNotes.mockResolvedValue([]);
    notesService.createNote.mockImplementation(async ({ bookId: createdBookId }: { bookId: string }) =>
      note({ id: `general-note-${++nextNoteId}`, bookId: createdBookId }),
    );
    notesService.updateNote.mockImplementation(async (id: string, data: { title: string; content: string }) =>
      note({ id, ...data }),
    );
    notesService.deleteNote.mockResolvedValue({ success: true });

    await TestBed.configureTestingModule({
      imports: [GeneralNotesSidebarSection],
      providers: [
        {
          provide: WorkspaceStore,
          useValue: {
            bookId,
            sidebarOpen,
            openSidebar: vi.fn(() => sidebarOpen.set(true)),
          },
        },
        { provide: GeneralNotesService, useValue: notesService },
        { provide: ToastService, useValue: toastService },
        { provide: ElectronService, useValue: electronService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GeneralNotesSidebarSection);
    component = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.destroy();
    overlayContainer.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  it('loads notes for the active book in displayed-title alphabetical order', async () => {
    notesService.getNotes.mockResolvedValue([
      note({ id: 'z', title: 'zebra' }),
      note({ id: 'u', title: '' }),
      note({ id: 'a', title: 'Alpha' }),
    ]);

    bookId.set('book-2');
    fixture.detectChanges();

    await vi.waitFor(() => {
      expect(notesService.getNotes).toHaveBeenLastCalledWith('book-2');
      expect(component.notes().map(item => item.id)).toEqual(['a', 'u', 'z']);
    });
  });

  it('persists an untitled note and opens the editor panel', async () => {
    await component.createNote();
    fixture.detectChanges();

    expect(notesService.createNote).toHaveBeenCalledWith({ bookId: 'book-1', title: '', content: '' });
    expect(component.notes().map(item => item.id)).toEqual(['general-note-1']);
    expect(component.selectedNote()?.id).toBe('general-note-1');
    expect(overlayContainer.getContainerElement().querySelector('.note-editor-panel')).not.toBeNull();
  });

  it('reorders live edits and saves the latest note after the debounce', async () => {
    await component.createNote();
    component.updateSelectedTitle('Zulu');
    await component.createNote();
    component.updateSelectedTitle('Alpha');
    component.updateSelectedContent('Latest body');

    expect(component.notes().map(item => item.title)).toEqual(['Alpha', 'Zulu']);

    vi.useFakeTimers();
    component.updateSelectedContent('Newest body');
    await vi.advanceTimersByTimeAsync(300);

    expect(notesService.updateNote).toHaveBeenLastCalledWith('general-note-2', {
      title: 'Alpha',
      content: 'Newest body',
    });
  });

  it('filters notes by title and content while preserving alphabetical order', async () => {
    await component.createNote();
    component.updateSelectedTitle('Zulu character');
    component.updateSelectedContent('Mara');
    await component.createNote();
    component.updateSelectedTitle('Alpha character');
    component.updateSelectedContent('Mara');

    component.searchQuery.set('mara');

    expect(component.filteredNotes().map(item => item.title)).toEqual(['Alpha character', 'Zulu character']);
  });

  it('deletes from the backend before removing the selected note', async () => {
    await component.createNote();
    await component.deleteSelectedNote();

    expect(notesService.deleteNote).toHaveBeenCalledWith('general-note-1');
    expect(component.notes()).toEqual([]);
    expect(component.selectedNote()).toBeNull();
  });

  it('keeps a note and reports an error when deletion fails', async () => {
    await component.createNote();
    notesService.deleteNote.mockRejectedValueOnce(new Error('Delete failed'));

    await component.deleteSelectedNote();

    expect(component.notes()).toHaveLength(1);
    expect(component.selectedNote()?.id).toBe('general-note-1');
    expect(toastService.error).toHaveBeenCalledWith('Delete failed', 'Notes');
  });

  it('renders compact controls when the workspace sidebar is collapsed', () => {
    sidebarOpen.set(false);
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.notes-section') as HTMLElement;
    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(fixture.nativeElement.querySelector('.add-btn')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.search-shell')).not.toBeNull();
  });
});

function note(changes: Partial<GeneralNoteDto> = {}): GeneralNoteDto {
  return {
    id: 'note-1',
    bookId: 'book-1',
    title: '',
    content: '',
    createdAt: '2026-08-21T12:00:00.000Z',
    lastEditedAt: '2026-08-21T12:00:00.000Z',
    ...changes,
  };
}
