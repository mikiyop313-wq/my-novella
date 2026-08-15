import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigStore } from '../../../../../core/store/config.store';
import { ImageCropModalComponent } from '../../../../../shared/components/image-crop-modal/image-crop-modal.component';
import { LibraryService } from '../../../services/library.service';
import { LibraryStore } from '../../../store/book.store';
import { BookCreate } from '../book-create';

describe('BookCreate cover upload', () => {
  let fixture: ComponentFixture<BookCreate>;
  let imageWidth: number;
  let imageHeight: number;

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

    await TestBed.configureTestingModule({
      imports: [BookCreate],
      providers: [
        { provide: LibraryService, useValue: { addNewBook: vi.fn() } },
        { provide: LibraryStore, useValue: {} },
        {
          provide: ConfigStore,
          useValue: {
            languages: signal([]),
            genres: signal([]),
            tropes: signal([]),
            loadLanguages: vi.fn(),
            loadGenres: vi.fn(),
            loadTropes: vi.fn(),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookCreate);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    [600, 900],
    [606, 900],
  ])('bypasses cropping for a %d by %d image within tolerance', async (width, height) => {
    imageWidth = width;
    imageHeight = height;
    const file = imageFile('matching.png');

    await fixture.componentInstance.onFileChange(fileInputEvent(file));
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(fixture.componentInstance.bookForm.value.coverImage).toContain('data:image/png');
    expect(
      document.querySelector('.cdk-overlay-container .crop-modal'),
    ).toBeNull();
  });

  it('opens the crop modal for an image outside tolerance', async () => {
    imageWidth = 607;
    imageHeight = 900;
    const file = imageFile('wide.png');

    await fixture.componentInstance.onFileChange(fileInputEvent(file));
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingCoverFile()).toBe(file);
    expect(
      document.querySelector('.cdk-overlay-container .crop-modal'),
    ).not.toBeNull();
  });

  it('uses a cropped file and clears pending crop state', async () => {
    fixture.componentInstance.pendingCoverFile.set(imageFile('source.png'));
    const cropped = new File(['cropped'], 'source.webp', { type: 'image/webp' });

    await fixture.componentInstance.onCoverCropped(cropped);

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(fixture.componentInstance.coverPreview()).toContain('data:image/webp');
    expect(fixture.componentInstance.bookForm.value.coverImage).toBe(
      fixture.componentInstance.coverPreview(),
    );
  });

  it('preserves the current cover when cropping is cancelled', () => {
    fixture.componentInstance.coverPreview.set('data:image/png;base64,current');
    fixture.componentInstance.bookForm.patchValue({
      coverImage: 'data:image/png;base64,current',
    });
    fixture.componentInstance.pendingCoverFile.set(imageFile('replacement.png'));

    fixture.componentInstance.cancelCoverCrop();

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(fixture.componentInstance.coverPreview()).toBe('data:image/png;base64,current');
    expect(fixture.componentInstance.bookForm.value.coverImage).toBe(
      'data:image/png;base64,current',
    );
  });

  it('ignores non-images and resets the file input', async () => {
    const input = fileInput(new File(['text'], 'notes.txt', { type: 'text/plain' }));

    await fixture.componentInstance.onFileChange({ target: input } as unknown as Event);

    expect(fixture.componentInstance.pendingCoverFile()).toBeNull();
    expect(fixture.componentInstance.coverPreview()).toBeNull();
    expect(input.value).toBe('');
  });

  it('routes dropped files through the same crop decision', async () => {
    imageWidth = 1000;
    imageHeight = 1000;
    const file = imageFile('square.png');
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;

    await fixture.componentInstance.onDrop(event);

    expect(fixture.componentInstance.pendingCoverFile()).toBe(file);
  });

  function imageFile(name: string): File {
    return new File(['image'], name, { type: 'image/png' });
  }

  function fileInputEvent(file: File): Event {
    return { target: fileInput(file) } as unknown as Event;
  }

  function fileInput(file: File): HTMLInputElement {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'selected' });
    return input;
  }
});
