import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto } from '../../../../../../../shared/models/book.model';
import { ConfigStore } from '../../../../../core/store/config.store';
import { ConfirmModalService } from '../../../../../shared/components/confirm-modal/confirm-modal.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { CodexService } from '../../../../codex/services/codex.service';
import { LibraryStore, type BookUi } from '../../../store/book.store';
import { BookModalComponent } from '../book-modal.component';

describe('BookModalComponent lifecycle actions', () => {
  let fixture: ComponentFixture<BookModalComponent>;
  let updateBook: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let getEntries: ReturnType<typeof vi.fn>;
  let imageWidth: number;
  let imageHeight: number;

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
    imageWidth = 600;
    imageHeight = 900;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:selected-cover'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = imageWidth;
        naturalHeight = imageHeight;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
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
    getEntries = vi.fn().mockResolvedValue([{ id: 'character-1', name: 'Mara' }]);

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
        {
          provide: CodexService,
          useValue: { getEntries },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookModalComponent);
    fixture.componentRef.setInput('book', book);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('archives immediately and closes the modal', async () => {
    const confirmService = TestBed.inject(ConfirmModalService);
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);

    fixture.componentInstance.onArchive();
    await fixture.whenStable();

    expect(updateBook).toHaveBeenCalledWith('book-1', { status: 'archived' });
    expect(confirmService.state().show).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('deletes immediately and closes the modal', () => {
    const confirmService = TestBed.inject(ConfirmModalService);
    const deleted = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.bookDeleted.subscribe(deleted);
    fixture.componentInstance.close.subscribe(closed);

    fixture.componentInstance.onDelete();

    expect(deleted).toHaveBeenCalledWith('book-1');
    expect(confirmService.state().show).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('reports a failed archive and re-enables lifecycle controls', async () => {
    updateBook.mockRejectedValueOnce(new Error('Archive unavailable'));
    const confirmService = TestBed.inject(ConfirmModalService);

    fixture.componentInstance.onArchive();
    await fixture.whenStable();

    expect(confirmService.state().show).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Archive unavailable', 'Archive failed');
    expect(fixture.componentInstance.isLifecycleActionPending()).toBe(false);
  });

  it('loads active characters as POV options and clears the selection with None', async () => {
    await fixture.whenStable();

    expect(fixture.componentInstance.selectedPovCharacter()).toBe('');
    expect(getEntries).toHaveBeenCalledWith('book-1', {
      type: 'character',
      status: 'active',
    });
    expect(fixture.componentInstance.povCharacterOptions()).toEqual([
      { value: '', label: 'None' },
      { value: 'character-1', label: 'Mara' },
    ]);

    fixture.componentInstance.onSelectionChange('povCharacter', '');
    await fixture.whenStable();

    expect(fixture.componentInstance.selectedPovCharacter()).toBe('');
    expect(updateBook).toHaveBeenCalledWith('book-1', {
      settings: { povCharacterId: null },
    });
  });

  it('updates immediately with the original file when its ratio is within tolerance', async () => {
    imageWidth = 606;
    imageHeight = 900;
    const file = imageFile('matching.png');
    const input = fileInput(file);

    await fixture.componentInstance.onCoverImageChange({ target: input } as unknown as Event);

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(updateBook).toHaveBeenCalledWith('book-1', {
      coverImage: expect.stringContaining('data:image/png'),
    });
    expect(input.value).toBe('');
  });

  it('opens the crop modal for an image outside tolerance', async () => {
    imageWidth = 607;
    imageHeight = 900;
    const file = imageFile('wide.png');

    await fixture.componentInstance.onCoverImageChange({
      target: fileInput(file),
    } as unknown as Event);
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingCoverFile()).toBe(file);
    expect(fixture.nativeElement.querySelector('app-image-crop-modal')).not.toBeNull();
    expect(updateBook).not.toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ coverImage: expect.anything() }),
    );
  });

  it('persists the cropped WebP and clears pending state', async () => {
    fixture.componentInstance.pendingCoverFile.set(imageFile('source.png'));
    const cropped = new File(['cropped'], 'source.webp', { type: 'image/webp' });

    await fixture.componentInstance.onCoverCropped(cropped);

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(updateBook).toHaveBeenCalledWith('book-1', {
      coverImage: expect.stringContaining('data:image/webp'),
    });
  });

  it('cancels cropping without changing the current cover', () => {
    fixture.componentInstance.pendingCoverFile.set(imageFile('replacement.png'));

    fixture.componentInstance.cancelCoverCrop();

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(fixture.componentInstance.book().coverImage).toBeNull();
    expect(updateBook).not.toHaveBeenCalledWith(
      'book-1',
      expect.objectContaining({ coverImage: expect.anything() }),
    );
  });

  it('ignores non-image files and resets the input', async () => {
    const input = fileInput(new File(['text'], 'notes.txt', { type: 'text/plain' }));

    await fixture.componentInstance.onCoverImageChange({ target: input } as unknown as Event);

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(input.value).toBe('');
  });

  function imageFile(name: string): File {
    return new File(['image'], name, { type: 'image/png' });
  }

  function fileInput(file: File): HTMLInputElement {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'selected' });
    return input;
  }
});
