import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDatabaseClient } from '../../core/factory';

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('../../index', () => ({ db: mockedDatabase.value }));

describe('GeneralNoteRepository', () => {
  let sqlite: Database.Database;
  let repository: import('../general-note.repository').GeneralNoteRepository;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE books (
        id TEXT PRIMARY KEY NOT NULL,
        last_edited_at INTEGER
      );
      CREATE TABLE general_notes (
        id TEXT PRIMARY KEY NOT NULL,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER,
        last_edited_at INTEGER
      );
    `);
    mockedDatabase.value = createDatabaseClient(sqlite);
    const module = await import('../general-note.repository');
    repository = new module.GeneralNoteRepository();
  });

  beforeEach(() => {
    sqlite.exec('DELETE FROM general_notes; DELETE FROM books;');
    sqlite.prepare('INSERT INTO books (id, last_edited_at) VALUES (?, ?)').run('book-1', 1);
    sqlite.prepare('INSERT INTO books (id, last_edited_at) VALUES (?, ?)').run('book-2', 1);
  });

  afterAll(() => sqlite.close());

  it('lists one book alphabetically with Untitled under U and deterministic ties', async () => {
    insertNote({ id: 'z', title: 'zebra', createdAt: 4 });
    insertNote({ id: 'u', title: '', createdAt: 3 });
    insertNote({ id: 'b', title: 'beta', createdAt: 2 });
    insertNote({ id: 'a-2', title: 'Alpha', createdAt: 2 });
    insertNote({ id: 'a-1', title: 'alpha', createdAt: 1 });
    insertNote({ id: 'other', title: 'Before', createdAt: 1, bookId: 'book-2' });

    const notes = await repository.getNotes('book-1');

    expect(notes.map(note => note.id)).toEqual(['a-1', 'a-2', 'b', 'u', 'z']);
  });

  it('creates, updates, and deletes a note while touching its book', async () => {
    const created = await repository.create({ bookId: 'book-1', title: 'Draft', content: 'One' });
    const afterCreate = bookLastEdited();
    expect(created).toMatchObject({ bookId: 'book-1', title: 'Draft', content: 'One' });
    expect(afterCreate).toBeGreaterThan(1);

    const updated = await repository.update(created.id, { title: 'Final', content: 'Two' });
    expect(updated).toMatchObject({ title: 'Final', content: 'Two' });

    expect(await repository.delete(created.id)).toEqual({ success: true });
    expect(await repository.delete(created.id)).toEqual({ success: false });
    expect(await repository.getNotes('book-1')).toEqual([]);
  });

  it('removes notes when their book is deleted', async () => {
    insertNote({ id: 'note-1', title: 'Idea', createdAt: 1 });
    sqlite.prepare('DELETE FROM books WHERE id = ?').run('book-1');

    expect(await repository.getNotes('book-1')).toEqual([]);
  });

  function insertNote({
    id,
    title,
    createdAt,
    bookId = 'book-1',
  }: {
    id: string;
    title: string;
    createdAt: number;
    bookId?: string;
  }): void {
    sqlite.prepare(`
      INSERT INTO general_notes (id, book_id, title, content, created_at, last_edited_at)
      VALUES (?, ?, ?, '', ?, ?)
    `).run(id, bookId, title, createdAt, createdAt);
  }

  function bookLastEdited(): number {
    return sqlite.prepare('SELECT last_edited_at FROM books WHERE id = ?').get('book-1')
      .last_edited_at as number;
  }
});
