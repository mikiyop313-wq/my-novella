import { NgTemplateOutlet } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ElementAnimationDirective } from '../../../../shared/directives/element-animation.directive';
import { MarkdownEditorComponent } from '../../../../shared/components/markdown-editor/markdown-editor.component';
import {
  MarkdownPlainTextPipe,
  markdownToPlainText,
} from '../../../../shared/pipes/markdown-plain-text.pipe';
import { ToastService } from '../../../../shared/services/toast.service';
import { ElectronService } from '../../../../core/services/electron.service';
import type {
  GeneralNoteDto,
  UpdateGeneralNoteDto,
} from '../../../../../../shared/models/general-note.model';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { GeneralNotesService } from '../../services/general-notes.service';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
const COPY_CONFIRMATION_DURATION_MS = 2000;

interface PendingNoteSave {
  noteId: string;
  data: UpdateGeneralNoteDto;
}

@Component({
  selector: 'app-general-notes-sidebar-section',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    OverlayModule,
    ElementAnimationDirective,
    MarkdownEditorComponent,
    MarkdownPlainTextPipe,
  ],
  templateUrl: './general-notes-sidebar-section.html',
  styleUrl: './general-notes-sidebar-section.scss',
})
export class GeneralNotesSidebarSection implements OnDestroy {
  readonly store = inject(WorkspaceStore);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly notesService = inject(GeneralNotesService);
  private readonly toastService = inject(ToastService);
  private readonly electronService = inject(ElectronService);

  readonly notes = signal<GeneralNoteDto[]>([]);
  readonly searchQuery = signal('');
  readonly selectedNoteId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly saveStatus = signal<SaveStatus>('idle');
  readonly noteCopied = signal(false);
  readonly selectedNote = computed(() => {
    const selectedId = this.selectedNoteId();
    return this.notes().find(note => note.id === selectedId) ?? null;
  });
  readonly filteredNotes = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    if (!query) return this.notes();

    return this.notes().filter(note =>
      note.title.toLocaleLowerCase().includes(query)
      || note.content.toLocaleLowerCase().includes(query),
    );
  });

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly noteAnimation = viewChild<ElementAnimationDirective>('noteAnimation');
  private saveTimer: number | null = null;
  private copyConfirmationTimer: number | null = null;
  private pendingSave: PendingNoteSave | null = null;
  private saveInFlight: Promise<void> | null = null;
  private loadRequestId = 0;
  private readonly closeHandler = (): Promise<void> => this.flushPendingSave();

  constructor() {
    effect(() => {
      void this.loadBookNotes(this.store.bookId());
    });
    this.electronService.onBeforeClose(this.closeHandler);
  }

  ngOnDestroy(): void {
    this.electronService.removeBeforeCloseHandler(this.closeHandler);
    this.clearCopyConfirmation();
    void this.flushPendingSave();
  }

  handleSearchClick(): void {
    if (!this.store.sidebarOpen()) {
      this.store.openSidebar();
      window.setTimeout(() => this.searchInput()?.nativeElement.focus(), 50);
      return;
    }

    this.searchInput()?.nativeElement.focus();
  }

  async createNote(): Promise<void> {
    const bookId = this.store.bookId();
    if (!bookId) {
      this.toastService.error('Open a book before creating a note.', 'Notes');
      return;
    }
    await this.flushPendingSave();
    if (this.store.bookId() !== bookId) return;

    let note: GeneralNoteDto;
    try {
      note = await this.notesService.createNote({ bookId, title: '', content: '' });
    } catch (error) {
      this.showError(error, 'Failed to create note.');
      return;
    }
    if (this.store.bookId() !== bookId) return;

    const previousNotePositions = this.captureNotePositions();
    const animation = this.noteAnimation();
    const addNote = async (): Promise<void> => {
      this.notes.update(notes => this.sortNotes([...notes, note]));
      this.selectedNoteId.set(note.id);
      this.changeDetectorRef.detectChanges();
      this.findNoteElement(note.id)?.classList.add('note-entry-pending');
      await this.animateNoteReflow(previousNotePositions, note.id);
    };

    if (!animation) {
      await addNote();
      return;
    }

    await animation.animateAfterCreate(addNote, () => {
      const createdNote = this.findNoteElement(note.id);
      createdNote?.classList.remove('note-entry-pending');
      return createdNote;
    });
  }

  async openNote(noteId: string): Promise<void> {
    await this.flushPendingSave();
    if (this.notes().some(note => note.id === noteId)) {
      this.clearCopyConfirmation();
      this.selectedNoteId.set(noteId);
    }
  }

  async closeNote(): Promise<void> {
    await this.flushPendingSave();
    this.clearCopyConfirmation();
    this.selectedNoteId.set(null);
  }

  updateSelectedTitle(title: string): void {
    this.updateSelectedNote({ title });
  }

  updateSelectedContent(content: string): void {
    this.updateSelectedNote({ content });
  }

  async copySelectedNote(): Promise<void> {
    const content = this.selectedNote()?.content ?? '';
    if (!content.trim()) return;

    try {
      await navigator.clipboard.writeText(markdownToPlainText(content));
      this.clearCopyConfirmation();
      this.noteCopied.set(true);
      this.copyConfirmationTimer = window.setTimeout(() => {
        this.noteCopied.set(false);
        this.copyConfirmationTimer = null;
      }, COPY_CONFIRMATION_DURATION_MS);
    } catch {
      this.clearCopyConfirmation();
      this.toastService.error('Unable to copy the note.', 'Copy failed');
    }
  }

  async deleteSelectedNote(): Promise<void> {
    const selectedId = this.selectedNoteId();
    if (!selectedId) return;

    this.discardPendingSave(selectedId);
    await this.saveInFlight;

    try {
      const result = await this.notesService.deleteNote(selectedId);
      if (!result.success) throw new Error('Note not found.');
    } catch (error) {
      this.showError(error, 'Failed to delete note.');
      return;
    }

    const noteElement = this.findNoteElement(selectedId);
    const deleteNote = (): void => {
      this.notes.update(notes => notes.filter(note => note.id !== selectedId));
      this.selectedNoteId.set(null);
      this.changeDetectorRef.detectChanges();
    };
    const animation = this.noteAnimation();

    if (!animation || !noteElement) {
      deleteNote();
      return;
    }

    await animation.animateBeforeDelete(noteElement, deleteNote);
    if (this.notes().some(note => note.id === selectedId)) {
      noteElement.classList.remove('note-entry-leaving');
    }
  }

  private updateSelectedNote(changes: Partial<Pick<GeneralNoteDto, 'title' | 'content'>>): void {
    const selectedId = this.selectedNoteId();
    if (!selectedId) return;

    this.notes.update(notes => this.sortNotes(notes.map(note =>
      note.id === selectedId ? { ...note, ...changes } : note,
    )));
    const selectedNote = this.notes().find(note => note.id === selectedId);
    if (selectedNote) {
      this.pendingSave = {
        noteId: selectedId,
        data: { title: selectedNote.title, content: selectedNote.content },
      };
      this.saveStatus.set('idle');
      if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => {
        this.saveTimer = null;
        void this.flushPendingSave();
      }, 300);
    }
  }

  private clearCopyConfirmation(): void {
    if (this.copyConfirmationTimer !== null) {
      window.clearTimeout(this.copyConfirmationTimer);
      this.copyConfirmationTimer = null;
    }
    this.noteCopied.set(false);
  }

  private async loadBookNotes(bookId: string | null): Promise<void> {
    const requestId = ++this.loadRequestId;
    await this.flushPendingSave();
    if (requestId !== this.loadRequestId) return;

    this.selectedNoteId.set(null);
    this.notes.set([]);
    this.saveStatus.set('idle');
    this.isLoading.set(false);
    if (!bookId) return;

    this.isLoading.set(true);
    try {
      const notes = await this.notesService.getNotes(bookId);
      if (requestId === this.loadRequestId) this.notes.set(this.sortNotes(notes));
    } catch (error) {
      if (requestId === this.loadRequestId) this.showError(error, 'Failed to load notes.');
    } finally {
      if (requestId === this.loadRequestId) this.isLoading.set(false);
    }
  }

  private async flushPendingSave(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.saveInFlight) return this.saveInFlight;
    if (!this.pendingSave) return;

    this.saveInFlight = this.savePendingChanges();
    try {
      await this.saveInFlight;
    } finally {
      this.saveInFlight = null;
    }
  }

  private async savePendingChanges(): Promise<void> {
    while (this.pendingSave) {
      if (this.saveTimer !== null) {
        window.clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      const pendingSave = this.pendingSave;
      this.pendingSave = null;
      this.saveStatus.set('saving');
      try {
        const updated = await this.notesService.updateNote(pendingSave.noteId, pendingSave.data);
        if (!updated) throw new Error('Note not found.');
        this.notes.update(notes => this.sortNotes(notes.map(note =>
          note.id === updated.id
            ? { ...note, createdAt: updated.createdAt, lastEditedAt: updated.lastEditedAt }
            : note,
        )));
        this.saveStatus.set('saved');
      } catch (error) {
        this.saveStatus.set('error');
        this.showError(error, 'Failed to save note.');
      }
    }
  }

  private discardPendingSave(noteId: string): void {
    if (this.pendingSave?.noteId === noteId) this.pendingSave = null;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private sortNotes(notes: GeneralNoteDto[]): GeneralNoteDto[] {
    return [...notes].sort((left, right) => {
      const leftTitle = left.title || 'Untitled';
      const rightTitle = right.title || 'Untitled';
      return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: 'base' })
        || left.createdAt.localeCompare(right.createdAt)
        || left.id.localeCompare(right.id);
    });
  }

  private showError(error: unknown, fallback: string): void {
    this.toastService.error(error instanceof Error ? error.message : fallback, 'Notes');
  }

  private findNoteElement(noteId: string): HTMLElement | null {
    return this.getNoteElements()
      .find(element => element.dataset['generalNoteId'] === noteId) ?? null;
  }

  private getNoteElements(): HTMLElement[] {
    return Array.from(
      this.hostElement.nativeElement.querySelectorAll<HTMLElement>('[data-general-note-id]'),
    );
  }

  private captureNotePositions(): Map<string, number> {
    return new Map(
      this.getNoteElements().flatMap(element => {
        const noteId = element.dataset['generalNoteId'];
        return noteId ? [[noteId, element.getBoundingClientRect().top] as const] : [];
      }),
    );
  }

  private async animateNoteReflow(
    previousPositions: ReadonlyMap<string, number>,
    createdNoteId: string,
  ): Promise<void> {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const animations = this.getNoteElements().flatMap(element => {
      const noteId = element.dataset['generalNoteId'];
      const previousTop = noteId ? previousPositions.get(noteId) : undefined;
      if (!noteId || noteId === createdNoteId || previousTop === undefined) return [];

      const offsetY = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(offsetY) < 0.5 || typeof element.animate !== 'function') return [];

      return [element.animate(
        [
          { transform: `translateY(${offsetY}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
      )];
    });

    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
    animations.forEach(animation => animation.cancel());
  }
}
