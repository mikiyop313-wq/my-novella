import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto } from '../../../../../../../shared/models/book.model';
import { ConfigStore } from '../../../../../core/store/config.store';
import { ConfirmModalService } from '../../../../../shared/components/confirm-modal/confirm-modal.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { LibraryStore, type BookUi } from '../../../store/book.store';
import { BookModalComponent } from '../book-modal.component';

describe('BookModalComponent lifecycle actions', () => {
  let fixture: ComponentFixture<BookModalComponent>;
  let updateBook: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;

  const book: BookUi = {
    id: 'book-1',
    title: 'The Glass Orchard',
    author: 'Mira Vale',
    status: 'draft',
    synopsis: '',
    coverImage: null,
    displayCoverImage: '',
    wordCount: 0,
    language: 'english',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-02T00:00:00.000Z',
    categories: [],
  };

  beforeEach(async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    updateBook = vi.fn().mockImplementation(
      async (_id: string, update: Partial<BookDto>): Promise<BookUi> => ({
        ...book,
        ...update,
      }),
    );
    toastError = vi.fn();

    await TestBed.configureTestingModule({
      imports: [BookModalComponent],
      providers: [
        {
          provide: LibraryStore,
          useValue: {
            getWordCount: vi.fn().mockResolvedValue(0),
            getChapterCount: vi.fn().mockResolvedValue(0),
            updateBook,
          },
        },
        {
          provide: ConfigStore,
          useValue: {
            languages: signal([]),
            genres: signal([]),
            loadLanguages: vi.fn(),
            loadGenres: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: { navigate: vi.fn() },
        },
        {
          provide: ToastService,
          useValue: { success: vi.fn(), error: toastError },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookModalComponent);
    fixture.componentRef.setInput('book', book);
    fixture.detectChanges();
  });

  it('requires confirmation before archiving', async () => {
    const confirmService = TestBed.inject(ConfirmModalService);

    fixture.componentInstance.onArchive();
    expect(updateBook).not.toHaveBeenCalled();

    confirmService.state().onCancel();
    expect(updateBook).not.toHaveBeenCalled();

    fixture.componentInstance.onArchive();
    confirmService.state().onConfirm();
    await fixture.whenStable();

    expect(updateBook).toHaveBeenCalledWith('book-1', { status: 'archived' });
  });

  it('requires confirmation before emitting permanent deletion', () => {
    const confirmService = TestBed.inject(ConfirmModalService);
    const deleted = vi.fn();
    fixture.componentInstance.bookDeleted.subscribe(deleted);

    fixture.componentInstance.onDelete();
    expect(deleted).not.toHaveBeenCalled();

    confirmService.state().onConfirm();
    expect(deleted).toHaveBeenCalledWith('book-1');
  });

  it('reports a failed archive and re-enables lifecycle controls', async () => {
    updateBook.mockRejectedValueOnce(new Error('Archive unavailable'));
    const confirmService = TestBed.inject(ConfirmModalService);

    fixture.componentInstance.onArchive();
    confirmService.state().onConfirm();
    await fixture.whenStable();

    expect(toastError).toHaveBeenCalledWith('Archive unavailable', 'Archive failed');
    expect(fixture.componentInstance.isLifecycleActionPending()).toBe(false);
  });
});
