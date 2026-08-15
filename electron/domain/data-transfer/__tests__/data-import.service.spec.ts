import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db', () => ({ db: {} }));

import type { db } from '../../../../db';
import {
  activeSystemPromptPresets,
  books,
  bookSettings,
  bookTags,
  categories,
  scene,
  systemPromptPresets,
} from '../../../../db/schema';
import { DataImportService } from '../data-import.service';
import { completeSnapshot } from './data-transfer.fixture';

describe('data import service', () => {
  let database: FakeImportDatabase;
  let createId: ReturnType<typeof vi.fn<() => string>>;
  let service: DataImportService;
  let nextId: number;

  beforeEach(() => {
    database = new FakeImportDatabase(
      new Map([
        [categories, [{ id: 'existing-fantasy', name: 'Fantasy', type: 'genre', isCustom: false }]],
      ]),
    );
    nextId = 0;
    createId = vi.fn(() => `new-${++nextId}`);
    service = new DataImportService({
      database: database as unknown as typeof db,
      createId,
    });
  });

  it('imports the complete graph with remapped IDs and decoded values', async () => {
    const result = await service.importSnapshot(completeSnapshot());

    expect(result).toEqual({ importedBookIds: ['new-1'] });
    expect(database.rowsFor(books)).toEqual([
      expect.objectContaining({
        id: 'new-1',
        coverImage: Buffer.from('cover'),
        createdAt: new Date('2026-08-14T12:00:00.000Z'),
      }),
    ]);
    expect(database.rowsFor(bookSettings)).toEqual([
      expect.objectContaining({ bookSettingId: 'new-1', povCharacterId: 'new-5' }),
    ]);
    expect(database.rowsFor(scene)).toEqual([
      expect.objectContaining({
        id: 'new-4',
        bookId: 'new-1',
        chapterId: 'new-3',
        povCharacterIdOverride: 'new-5',
      }),
    ]);
    expect(database.rowsFor(systemPromptPresets)).toEqual([
      expect.objectContaining({ id: 'new-11', bookId: 'new-1' }),
    ]);
  });

  it('reuses matching categories and creates missing categories', async () => {
    await service.importSnapshot(completeSnapshot());

    expect(database.rowsFor(categories)).toEqual([
      { id: 'existing-fantasy', name: 'Fantasy', type: 'genre', isCustom: false },
      { id: 'new-12', name: 'Quest', type: 'trope', isCustom: true },
    ]);
    expect(database.rowsFor(bookTags)).toEqual([
      { bookId: 'new-1', categoryId: 'existing-fantasy' },
      { bookId: 'new-1', categoryId: 'new-12' },
    ]);
  });

  it('imports custom prompt selections and keeps built-in selections implicit', async () => {
    await service.importSnapshot(completeSnapshot());

    expect(database.rowsFor(activeSystemPromptPresets)).toEqual([
      { bookId: 'new-1', category: 'chat', presetId: 'new-11' },
    ]);
  });

  it('can import the same snapshot repeatedly as independent copies', async () => {
    const first = await service.importSnapshot(completeSnapshot());
    const second = await service.importSnapshot(completeSnapshot());

    expect(first.importedBookIds).toEqual(['new-1']);
    expect(second.importedBookIds).toEqual(['new-13']);
    expect(database.rowsFor(books).map((book) => book['id'])).toEqual(['new-1', 'new-13']);
    expect(database.rowsFor(categories)).toHaveLength(2);
  });

  it('validates before starting a transaction', async () => {
    const invalid = completeSnapshot() as unknown as Record<string, unknown>;
    invalid['unexpected'] = true;

    await expect(service.importSnapshot(invalid)).rejects.toThrow('$.unexpected');
    expect(database.transactionCalls).toBe(0);
  });

  it('rolls back all writes when an insertion fails', async () => {
    database.failOnTable = scene;

    await expect(service.importSnapshot(completeSnapshot())).rejects.toThrow('insert failed');

    expect(database.rowsFor(books)).toEqual([]);
    expect(database.rowsFor(categories)).toEqual([
      { id: 'existing-fantasy', name: 'Fantasy', type: 'genre', isCustom: false },
    ]);
  });
});

class FakeImportDatabase {
  transactionCalls = 0;
  failOnTable: unknown;

  constructor(private rows: Map<unknown, Record<string, unknown>[]>) {}

  transaction<T>(work: (transaction: FakeImportTransaction) => T): T {
    this.transactionCalls += 1;
    const workingRows = new Map(
      [...this.rows].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
    );
    const result = work(new FakeImportTransaction(workingRows, () => this.failOnTable));
    this.rows = workingRows;
    return result;
  }

  rowsFor(table: unknown): Record<string, unknown>[] {
    return this.rows.get(table) ?? [];
  }
}

class FakeImportTransaction {
  constructor(
    private readonly rows: Map<unknown, Record<string, unknown>[]>,
    private readonly failedTable: () => unknown,
  ) {}

  select(): { from: (table: unknown) => { all: () => Record<string, unknown>[] } } {
    return {
      from: (table) => ({ all: () => this.rows.get(table) ?? [] }),
    };
  }

  insert(table: unknown): { values: (row: Record<string, unknown>) => { run: () => void } } {
    return {
      values: (row) => ({
        run: () => {
          if (table === this.failedTable()) throw new Error('insert failed');
          const tableRows = this.rows.get(table) ?? [];
          tableRows.push(row);
          this.rows.set(table, tableRows);
        },
      }),
    };
  }
}
