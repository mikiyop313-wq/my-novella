import Database from 'better-sqlite3';
import { Migrator, NO_MIGRATIONS } from 'kysely/migration';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient, type AppDatabase } from '../core/factory';
import { migrateDatabase } from '../core/migrator';
import { migrationProvider } from '../migration-provider';

describe('Kysely baseline migration', () => {
  let database: AppDatabase | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  it('creates the complete schema and can run repeatedly', async () => {
    const sqlite = new Database(':memory:');
    database = createDatabaseClient(sqlite);
    await migrateDatabase(database);
    await migrateDatabase(database);

    const tables = await database.introspection.getTables();
    const names = new Set(tables.map(({ name }) => name));
    expect(names.has('books')).toBe(true);
    expect(names.has('book_settings')).toBe(true);
    expect(names.has('system_prompt_presets')).toBe(true);

    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    expect(indexes.map(({ name }) => name)).toContain('chat_messages_thread_position_idx');

    const bookSettingsColumns = sqlite.prepare('PRAGMA table_info(book_settings)').all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(bookSettingsColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'vector_search_manual_selection_enabled',
          dflt_value: '0',
        }),
        expect.objectContaining({ name: 'vector_search_result_limit', dflt_value: '3' }),
      ]),
    );
  });

  it('rolls the baseline back', async () => {
    database = createDatabaseClient(new Database(':memory:'));
    await migrateDatabase(database);

    const migrator = new Migrator({ db: database, provider: migrationProvider });
    const { error } = await migrator.migrateTo(NO_MIGRATIONS);
    expect(error).toBeUndefined();

    const tables = await database.introspection.getTables();
    expect(tables.some(({ name }) => name === 'books')).toBe(false);
  });

  it('enforces foreign keys and prompt ownership checks', async () => {
    database = createDatabaseClient(new Database(':memory:'));
    await migrateDatabase(database);

    await expect(
      database.insertInto('books').values({
        id: 'book-1',
        title: 'Book',
        author: 'Author',
        status: 'draft',
        synopsis: null,
        language: 'missing-language',
        coverImage: null,
        wordCount: 0,
        createdAt: 0,
        lastEditedAt: 0,
      }).execute(),
    ).rejects.toThrow();

    await expect(
      database.insertInto('systemPromptPresets').values({
        id: 'prompt-1',
        name: 'Prompt',
        systemPrompt: 'Write.',
        category: 'chat',
        scope: 'global',
        bookId: 'book-1',
        temperature: 0.5,
        topP: 1,
        maxOutputTokens: null,
        presencePenalty: 0,
        frequencyPenalty: 0,
        defaultModelId: null,
        createdAt: 0,
        lastEditedAt: 0,
      }).execute(),
    ).rejects.toThrow();
  });
});
