import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateSystemPromptPresetDto,
  SystemPromptCategory,
} from '../../shared/models/system-prompt.model';
import * as schema from '../schema';

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('../index', () => ({
  db: mockedDatabase.value,
}));

describe('SystemPromptRepository', () => {
  let sqlite: Database.Database;
  let repository: import('./system-prompt.repository').SystemPromptRepository;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec('CREATE TABLE books (id text PRIMARY KEY NOT NULL);');
    sqlite.exec(
      readFileSync(
        new URL('../migrations/0011_system_prompt_presets.sql', import.meta.url),
        'utf8',
      ),
    );
    mockedDatabase.value = drizzle(sqlite, { schema });

    const { SystemPromptRepository } = await import('./system-prompt.repository');
    repository = new SystemPromptRepository();
  });

  beforeEach(() => {
    sqlite.exec(`
      DELETE FROM system_prompt_presets;
      DELETE FROM books;
      INSERT INTO books (id) VALUES ('book-1'), ('book-2');
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  it('preserves the category and every generation setting', async () => {
    const created = await repository.create(
      bookPreset('book-1', 'Scene Architect', 'sceneBeat', {
        temperature: 1.2,
        topP: 0.75,
        maxOutputTokens: 2048,
        presencePenalty: 0.4,
        frequencyPenalty: -0.3,
      }),
    );

    expect(created).toMatchObject({
      name: 'Scene Architect',
      systemPrompt: 'System instructions for Scene Architect',
      category: 'sceneBeat',
      scope: 'book',
      bookId: 'book-1',
      temperature: 1.2,
      topP: 0.75,
      maxOutputTokens: 2048,
      presencePenalty: 0.4,
      frequencyPenalty: -0.3,
    });
    expect(created.createdAt).toEqual(expect.any(String));
    expect(created.lastEditedAt).toEqual(expect.any(String));
  });

  it('lists global presets and only presets belonging to the requested book', async () => {
    const global = await repository.create(globalPreset('Shared Editor', 'rephrase'));
    const firstBook = await repository.create(bookPreset('book-1', 'Book One', 'summary'));
    await repository.create(bookPreset('book-2', 'Book Two', 'expand'));

    const available = await repository.listAvailableForBook('book-1');

    expect(available.map(({ id }) => id).sort()).toEqual([global.id, firstBook.id].sort());
  });

  it('moves presets between global and book ownership', async () => {
    const created = await repository.create(globalPreset('Movable', 'chat'));

    const movedToBook = await repository.update(created.id, {
      category: 'shorten',
      ownership: { scope: 'book', bookId: 'book-2' },
    });
    expect(movedToBook).toMatchObject({
      category: 'shorten',
      scope: 'book',
      bookId: 'book-2',
    });

    const movedToGlobal = await repository.update(created.id, {
      ownership: { scope: 'global' },
    });
    expect(movedToGlobal).toMatchObject({
      scope: 'global',
      bookId: null,
    });
  });

  it('rejects invalid ownership combinations', async () => {
    await expect(
      repository.create({
        ...basePreset('Invalid', 'chat'),
        scope: 'book',
        bookId: '',
      }),
    ).rejects.toThrow('require a book ID');

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO system_prompt_presets (
            id, name, system_prompt, category, scope, book_id, created_at, last_edited_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'invalid-global',
          'Invalid',
          'Invalid',
          'chat',
          'global',
          'book-1',
          Date.now(),
          Date.now(),
        ),
    ).toThrow();
  });

  it('cascades book presets while retaining global presets', async () => {
    const global = await repository.create(globalPreset('Shared', 'chat'));
    await repository.create(bookPreset('book-1', 'Owned', 'chat'));

    sqlite.prepare('DELETE FROM books WHERE id = ?').run('book-1');

    const rows = sqlite.prepare('SELECT id FROM system_prompt_presets ORDER BY id').all() as Array<{
      id: string;
    }>;
    expect(rows).toEqual([{ id: global.id }]);
  });

  it('reports missing updates and deletes', async () => {
    await expect(repository.update('missing', { name: 'Nothing' })).resolves.toBeUndefined();
    await expect(repository.delete('missing')).resolves.toEqual({ success: false });

    const created = await repository.create(globalPreset('Delete Me', 'summary'));
    await expect(repository.delete(created.id)).resolves.toEqual({ success: true });
  });
});

function basePreset(
  name: string,
  category: SystemPromptCategory,
  generation: Partial<
    Pick<
      CreateSystemPromptPresetDto,
      'temperature' | 'topP' | 'maxOutputTokens' | 'presencePenalty' | 'frequencyPenalty'
    >
  > = {},
) {
  return {
    name,
    systemPrompt: `System instructions for ${name}`,
    category,
    temperature: 0.5,
    topP: 1,
    maxOutputTokens: null,
    presencePenalty: 0,
    frequencyPenalty: 0,
    ...generation,
  };
}

function globalPreset(name: string, category: SystemPromptCategory): CreateSystemPromptPresetDto {
  return {
    ...basePreset(name, category),
    scope: 'global',
  };
}

function bookPreset(
  bookId: string,
  name: string,
  category: SystemPromptCategory,
  generation: Parameters<typeof basePreset>[2] = {},
): CreateSystemPromptPresetDto {
  return {
    ...basePreset(name, category, generation),
    scope: 'book',
    bookId,
  };
}
