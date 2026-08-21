import { NgTemplateOutlet } from '@angular/common';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ElementAnimationDirective } from '../../../../shared/directives/element-animation.directive';
import { MarkdownEditorComponent } from '../../../../shared/components/markdown-editor/markdown-editor.component';
import { MarkdownPlainTextPipe } from '../../../../shared/pipes/markdown-plain-text.pipe';
import { WorkspaceStore } from '../../../workspace/workspace.store';

interface GeneralNote {
  id: string;
  title: string;
  content: string;
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
export class GeneralNotesSidebarSection {
  readonly store = inject(WorkspaceStore);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly notes = signal<GeneralNote[]>([]);
  readonly searchQuery = signal('');
  readonly selectedNoteId = signal<string | null>(null);
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
  private nextNoteId = 1;

  handleSearchClick(): void {
    if (!this.store.sidebarOpen()) {
      this.store.openSidebar();
      window.setTimeout(() => this.searchInput()?.nativeElement.focus(), 50);
      return;
    }

    this.searchInput()?.nativeElement.focus();
  }

  async createNote(): Promise<void> {
    const note: GeneralNote = {
      id: `general-note-${this.nextNoteId}`,
      title: '',
      content: '',
    };
    this.nextNoteId += 1;
    const previousNotePositions = this.captureNotePositions();
    const animation = this.noteAnimation();
    const addNote = async (): Promise<void> => {
      this.notes.update(notes => [note, ...notes]);
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

  openNote(noteId: string): void {
    this.selectedNoteId.set(noteId);
  }

  closeNote(): void {
    this.selectedNoteId.set(null);
  }

  updateSelectedTitle(title: string): void {
    this.updateSelectedNote({ title });
  }

  updateSelectedContent(content: string): void {
    this.updateSelectedNote({ content });
  }

  async deleteSelectedNote(): Promise<void> {
    const selectedId = this.selectedNoteId();
    if (!selectedId) return;

    const noteElement = this.findNoteElement(selectedId);
    const deleteNote = (): void => {
      this.notes.update(notes => notes.filter(note => note.id !== selectedId));
      this.closeNote();
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

  private updateSelectedNote(changes: Partial<Pick<GeneralNote, 'title' | 'content'>>): void {
    const selectedId = this.selectedNoteId();
    if (!selectedId) return;

    this.notes.update(notes => notes.map(note =>
      note.id === selectedId ? { ...note, ...changes } : note,
    ));
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
