import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db', () => ({ db: {} }));

import { createDatabaseClient, type AppDatabase } from '../../../../db/core/factory';
import { migrateDatabase } from '../../../../db/core/migrator';
import { DataExportService } from '../data-export.service';
import { DataImportService } from '../data-import.service';
import { completeSnapshot } from './data-transfer.fixture';

describe('Kysely data transfer', () => {
  let database: AppDatabase | undefined;

  afterEach(async () => {
    await database?.destroy();
    database = undefined;
  });

  it('imports and exports a complete schema-version-1 graph', async () => {
    database = createDatabaseClient(new Database(':memory:'));
    await migrateDatabase(database);
    await database.insertInto('language').values({ languageName: 'english' }).execute();

    let nextId = 0;
    const importer = new DataImportService({
      database,
      createId: () => `imported-${++nextId}`,
    });
    const imported = await importer.importSnapshot(completeSnapshot());
    const exporter = new DataExportService({
      database,
      now: () => new Date('2026-08-16T12:00:00.000Z'),
    });
    const snapshot = await exporter.createBookExport(imported.importedBookIds[0]);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.data.books[0]).toMatchObject({
      id: 'imported-1',
      coverImage: 'Y292ZXI=',
      createdAt: '2026-08-14T12:00:00.000Z',
    });
    expect(snapshot.data.bookSettings[0]).toMatchObject({
      synopsisAiContext: true,
      vectorSearchEnabled: true,
      vectorSearchThresholdEnabled: true,
      vectorSearchSimilarityThreshold: 0.7,
      vectorSearchManualSelectionEnabled: true,
      vectorSearchResultLimit: 8,
      automaticIndexingEnabled: false,
    });
    expect(snapshot.data.scenes[0]).toMatchObject({
      prose: { type: 'doc', content: [] },
      includeInContext: true,
    });
    expect(snapshot.data.codexEntries[0].image).toBe('cG9ydHJhaXQ=');
    expect(snapshot.data.chatBranchSelections).toHaveLength(1);
    expect(snapshot.data.systemPromptPresets).toHaveLength(1);
  });

  it('rolls back all writes when an insert fails', async () => {
    database = createDatabaseClient(new Database(':memory:'));
    await migrateDatabase(database);
    await database.insertInto('language').values({ languageName: 'english' }).execute();
    const snapshot = completeSnapshot();
    snapshot.data.bookTags.push({ bookId: 'book-1', categoryId: 'missing-category' });
    const importer = new DataImportService({ database, createId: randomUUID });

    await expect(importer.importSnapshot(snapshot)).rejects.toThrow();
    const books = await database.selectFrom('books').select('id').execute();
    expect(books).toEqual([]);
  });
});
