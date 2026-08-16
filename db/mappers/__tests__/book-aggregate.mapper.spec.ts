import { describe, expect, it } from 'vitest';

import type { BookRow, BookSettingsRow } from '../../schema';
import { mapBookAggregate, type BookCategoryRow } from '../book-aggregate.mapper';

describe('book aggregate mapper', () => {
  it('maps SQLite values and persistence field names', () => {
    const [book] = mapBookAggregate({
      books: [bookRow({
        coverImage: Buffer.from([1, 2, 3]),
        wordCount: null,
        createdAt: null,
        lastEditedAt: 1,
      })],
      settings: [settingsRow()],
      categories: [categoryRow({ isCustom: 1 })],
    });

    expect(book).toMatchObject({
      id: 'book-1',
      coverImage: new Uint8Array([1, 2, 3]),
      wordCount: 0,
      createdAt: '1970-01-01T00:00:00.000Z',
      lastEditedAt: '1970-01-01T00:00:01.000Z',
      categories: [{ id: 'category-1', isCustom: true }],
      settings: {
        synopsisAiContext: false,
        openRouterEmbeddingModel: 'openai/text-embedding-3-small',
        vectorSearchEnabled: true,
        automaticIndexingEnabled: false,
      },
    });
  });

  it('isolates relations by book and preserves supplied order', () => {
    const books = mapBookAggregate({
      books: [bookRow({ id: 'book-2' }), bookRow({ id: 'book-1' })],
      settings: [settingsRow({ bookSettingId: 'book-1' })],
      categories: [
        categoryRow({ id: 'category-2', bookId: 'book-1' }),
        categoryRow({ id: 'category-1', bookId: 'book-1' }),
      ],
    });

    expect(books.map(({ id }) => id)).toEqual(['book-2', 'book-1']);
    expect(books[0].categories).toEqual([]);
    expect(books[0]).not.toHaveProperty('settings');
    expect(books[1].categories?.map(({ id }) => id)).toEqual(['category-2', 'category-1']);
    expect(books[1]).toHaveProperty('settings');
  });
});

function bookRow(overrides: Partial<BookRow> = {}): BookRow {
  return {
    id: 'book-1',
    title: 'Book',
    author: 'Author',
    status: 'draft',
    synopsis: null,
    language: 'english',
    coverImage: null,
    wordCount: 100,
    createdAt: 10,
    lastEditedAt: 20,
    ...overrides,
  };
}

function settingsRow(overrides: Partial<BookSettingsRow> = {}): BookSettingsRow {
  return {
    bookSettingId: 'book-1',
    language: 'english',
    proseTense: 'past',
    pointOfView: 'third_limited',
    synopsisAiContext: 0,
    povCharacterId: null,
    embeddingModel: 'openRouter',
    localEmbeddingModel: null,
    openrouterEmbeddingModel: 'openai/text-embedding-3-small',
    vectorSearchEnabled: 1,
    automaticIndexingEnabled: 0,
    ...overrides,
  };
}

function categoryRow(overrides: Partial<BookCategoryRow> = {}): BookCategoryRow {
  return {
    bookId: 'book-1',
    id: 'category-1',
    name: 'Fantasy',
    type: 'genre',
    isCustom: 0,
    ...overrides,
  };
}
