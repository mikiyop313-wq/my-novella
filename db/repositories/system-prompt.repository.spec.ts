import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILT_IN_SYSTEM_PROMPT_PRESETS } from '../../shared/constants/ai-system-prompts';
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
    sqlite.exec(`
      CREATE TABLE system_prompt_presets (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        system_prompt text NOT NULL,
        category text NOT NULL,
        scope text NOT NULL,
        book_id text REFERENCES books(id) ON DELETE CASCADE,
        temperature real DEFAULT 0.5 NOT NULL,
        top_p real DEFAULT 1 NOT NULL,
        max_output_tokens integer,
        presence_penalty real DEFAULT 0 NOT NULL,
        frequency_penalty real DEFAULT 0 NOT NULL,
        created_at integer DEFAULT (unixepoch()) NOT NULL,
        last_edited_at integer DEFAULT (unixepoch()) NOT NULL,
        CONSTRAINT system_prompt_presets_scope_book_check CHECK (
          (scope = 'global' AND book_id IS NULL)
          OR (scope = 'book' AND book_id IS NOT NULL)
        )
      );
      CREATE INDEX system_prompt_presets_scope_book_category_idx
        ON system_prompt_presets (scope, book_id, category);
      CREATE TABLE active_system_prompt_presets (
        book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        category text NOT NULL,
        preset_id text NOT NULL REFERENCES system_prompt_presets(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, category)
      );
      CREATE INDEX active_system_prompt_presets_preset_idx
        ON active_system_prompt_presets (preset_id);
    `);
    mockedDatabase.value = drizzle(sqlite, { schema });

    const { SystemPromptRepository } = await import('./system-prompt.repository');
    repository = new SystemPromptRepository();
  });

  beforeEach(() => {
    sqlite.exec(`
      DELETE FROM active_system_prompt_presets;
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

  it('rejects book ownership without a book ID', async () => {
    await expect(
      repository.create({
        ...basePreset('Invalid', 'chat'),
        scope: 'book',
        bookId: '',
      }),
    ).rejects.toThrow('require a book ID');
  });

  it('enforces scope and book ownership in the database schema', () => {
    const insert = sqlite.prepare(`
      INSERT INTO system_prompt_presets (
        id, name, system_prompt, category, scope, book_id
      ) VALUES (?, 'Invalid', 'Prompt', 'chat', ?, ?)
    `);

    expect(() => insert.run('invalid-global', 'global', 'book-1')).toThrow();
    expect(() => insert.run('invalid-book', 'book', null)).toThrow();
    expect(() => insert.run('missing-book', 'book', 'missing')).toThrow();
  });

  it('returns built-in defaults when no custom preset is active', async () => {
    const active = await repository.listActivePresetIdsForBook('book-1');

    expect(active).toEqual({
      chat: BUILT_IN_SYSTEM_PROMPT_PRESETS.chat.id,
      sceneBeat: BUILT_IN_SYSTEM_PROMPT_PRESETS.sceneBeat.id,
      rephrase: BUILT_IN_SYSTEM_PROMPT_PRESETS.rephrase.id,
      summary: BUILT_IN_SYSTEM_PROMPT_PRESETS.summary.id,
      expand: BUILT_IN_SYSTEM_PROMPT_PRESETS.expand.id,
      shorten: BUILT_IN_SYSTEM_PROMPT_PRESETS.shorten.id,
      title: BUILT_IN_SYSTEM_PROMPT_PRESETS.title.id,
    });
  });

  it('sets and resets book and global active presets by category', async () => {
    const book = await repository.create(bookPreset('book-1', 'Book Chat', 'chat'));
    const global = await repository.create(globalPreset('Shared Summary', 'summary'));

    let active = await repository.setActivePreset('book-1', 'chat', book.id);
    active = await repository.setActivePreset('book-1', 'summary', global.id);
    expect(active.chat).toBe(book.id);
    expect(active.summary).toBe(global.id);

    active = await repository.resetActivePreset('book-1', 'chat');
    expect(active.chat).toBe(BUILT_IN_SYSTEM_PROMPT_PRESETS.chat.id);
    expect(active.summary).toBe(global.id);
  });

  it('rejects invalid active preset scope and category', async () => {
    const otherBook = await repository.create(bookPreset('book-2', 'Other Book', 'chat'));
    const summary = await repository.create(globalPreset('Summary', 'summary'));

    await expect(repository.setActivePreset('book-1', 'chat', otherBook.id))
      .rejects.toThrow('another book');
    await expect(repository.setActivePreset('book-1', 'chat', summary.id))
      .rejects.toThrow('category');
    await expect(repository.setActivePreset('book-1', 'chat', 'missing'))
      .rejects.toThrow('does not exist');
  });

  it('cascades active selections when a preset or book is deleted', async () => {
    const global = await repository.create(globalPreset('Shared', 'chat'));
    await repository.setActivePreset('book-1', 'chat', global.id);
    await repository.setActivePreset('book-2', 'chat', global.id);

    sqlite.prepare('DELETE FROM books WHERE id = ?').run('book-1');
    expect((await repository.listActivePresetIdsForBook('book-2')).chat).toBe(global.id);

    await repository.delete(global.id);
    expect((await repository.listActivePresetIdsForBook('book-2')).chat)
      .toBe(BUILT_IN_SYSTEM_PROMPT_PRESETS.chat.id);
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
