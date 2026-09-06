import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookDto } from '../../../../../../shared/models/book.model';
import { LibraryService } from '../../services/library.service';
import { LibraryStore } from '../book.store';

describe('LibraryStore', () => {
  let store: InstanceType<typeof LibraryStore>;
  let getBooks: ReturnType<typeof vi.fn>;
  let updateBook: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getBooks = vi.fn().mockResolvedValue([book(true)]);
    updateBook = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        LibraryStore,
        {
          provide: LibraryService,
          useValue: { getBooks, updateBook },
        },
      ],
    });
    store = TestBed.inject(LibraryStore);
  });

  it('synchronizes an already-persisted book without saving it again', async () => {
    await store.loadBooks();
    const updatedBook = book(false);

    store.syncBook(updatedBook);

    expect(store.books()[0].settings?.vectorSearchEnabled).toBe(false);
    expect(store.books()[0].displayCoverImage).toBeTruthy();
    expect(updateBook).not.toHaveBeenCalled();
  });
});

function book(vectorSearchEnabled: boolean): BookDto {
  return {
    id: 'book-1',
    title: 'Book',
    author: 'Author',
    status: 'draft',
    synopsis: null,
    coverImage: null,
    wordCount: 0,
    language: 'english',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      language: 'english',
      proseTense: 'past',
      pointOfView: 'third_limited',
      synopsisAiContext: false,
      vectorSearchEnabled,
    },
  };
}
