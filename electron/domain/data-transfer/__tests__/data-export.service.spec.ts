import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../db', () => ({ db: {} }));

import {
  act,
  activeSystemPromptPresets,
  books,
  bookSettings,
  bookTags,
  categories,
  chapter,
  chatBranchSelections,
  chatMessages,
  chatThreads,
  codexEntries,
  codexEntryNotes,
  codexEntryProgression,
  scene,
  systemPromptPresets,
} from '../../../../db/schema';
import { DataExportService } from '../data-export.service';

const exportedAt = new Date('2026-08-14T12:00:00.000Z');
const createdAt = new Date('2026-01-01T10:00:00.000Z');
const lastEditedAt = new Date('2026-02-01T10:00:00.000Z');

describe('DataExportService', () => {
  it('creates a JSON-safe, restorable book snapshot and filters prompt selections', async () => {
    const rows = populatedRows();
    const { service, transaction } = createService(rows);

    const snapshot = await service.createBookExport('book-1');

    expect(transaction).toHaveBeenCalledOnce();
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      exportedAt: exportedAt.toISOString(),
      scope: { type: 'book', bookId: 'book-1' },
    });
    expect(snapshot.data.books[0]).toMatchObject({
      id: 'book-1',
      coverImage: Buffer.from('cover').toString('base64'),
      createdAt: createdAt.toISOString(),
      lastEditedAt: lastEditedAt.toISOString(),
    });
    expect(snapshot.data.acts.map((item) => item.id)).toEqual(['act-1', 'act-2']);
    expect(snapshot.data.scenes).toHaveLength(1);
    expect(snapshot.data.codexEntries[0]).toMatchObject({
      id: 'codex-1',
      image: Buffer.from('portrait').toString('base64'),
      createdAt: createdAt.toISOString(),
    });
    expect(snapshot.data.codexEntryNotes).toHaveLength(1);
    expect(snapshot.data.codexEntryProgression).toHaveLength(1);
    expect(snapshot.data.chatMessages).toHaveLength(1);
    expect(snapshot.data.chatBranchSelections).toHaveLength(1);
    expect(snapshot.data.systemPromptPresets.map((preset) => preset.id)).toEqual(['book-preset']);
    expect(snapshot.data.activeSystemPromptPresets.map((selection) => selection.presetId))
      .toEqual(['book-preset', 'default-title']);
    expect(JSON.stringify(snapshot)).not.toContain('Buffer');
    expect(JSON.stringify(snapshot)).not.toContain('2026-01-01T10:00:00.000Z.000Z');
  });

  it('rejects a single-book export when the book does not exist', async () => {
    const { service } = createService(new Map([[books, []]]));

    await expect(service.createBookExport('missing-book')).rejects.toThrow(
      'Data export book not found: "missing-book".',
    );
  });

  it('creates a valid empty library snapshot without querying dependent tables', async () => {
    const { service, selectedTables } = createService(new Map([[books, []]]));

    const snapshot = await service.createLibraryExport();

    expect(snapshot.scope).toEqual({ type: 'library' });
    expect(snapshot.data).toEqual({
      books: [],
      bookSettings: [],
      categories: [],
      bookTags: [],
      acts: [],
      chapters: [],
      scenes: [],
      codexEntries: [],
      codexEntryNotes: [],
      codexEntryProgression: [],
      chatThreads: [],
      chatMessages: [],
      chatBranchSelections: [],
      systemPromptPresets: [],
      activeSystemPromptPresets: [],
    });
    expect(selectedTables).toEqual([books]);
  });

  it('orders library records deterministically and deduplicates category lookups', async () => {
    const rows = emptyRows();
    rows.set(books, [bookRow({ id: 'book-b', title: 'B' }), bookRow({ id: 'book-a', title: 'A' })]);
    rows.set(bookTags, [
      { bookId: 'book-b', categoryId: 'category-1' },
      { bookId: 'book-a', categoryId: 'category-1' },
    ]);
    rows.set(categories, [
      { id: 'category-1', name: 'Fantasy', type: 'genre', isCustom: false },
    ]);
    rows.set(act, [
      { id: 'act-2', bookId: 'book-a', title: 'Second', position: 1, status: 'active', summary: null },
      { id: 'act-1', bookId: 'book-a', title: 'First', position: 0, status: 'archived', summary: null },
    ]);

    const { service } = createService(rows);
    const snapshot = await service.createLibraryExport();

    expect(snapshot.data.books.map((book) => book.id)).toEqual(['book-a', 'book-b']);
    expect(snapshot.data.categories).toHaveLength(1);
    expect(snapshot.data.acts.map((item) => item.id)).toEqual(['act-1', 'act-2']);
  });
});

function createService(rows: Map<unknown, unknown[]>) {
  const selectedTables: unknown[] = [];
  const transaction = vi.fn((read: (transaction: unknown) => unknown) => read({
    select: () => ({
      from: (table: unknown) => {
        selectedTables.push(table);
        const all = () => [...(rows.get(table) ?? [])];
        return {
          all,
          where: () => ({ all }),
        };
      },
    }),
  }));
  const service = new DataExportService({
    database: { transaction } as never,
    now: () => exportedAt,
  });

  return { service, selectedTables, transaction };
}

function populatedRows(): Map<unknown, unknown[]> {
  const rows = emptyRows();
  rows.set(books, [bookRow()]);
  rows.set(bookSettings, [{
    bookSettingId: 'book-1',
    language: 'english',
    proseTense: 'past',
    pointOfView: 'third_limited',
    synopsisAiContext: true,
    povCharacterId: 'codex-1',
    embeddingModel: 'local',
    localEmbeddingModel: null,
    openRouterEmbeddingModel: null,
    vectorSearchEnabled: true,
    automaticIndexingEnabled: false,
  }]);
  rows.set(bookTags, [{ bookId: 'book-1', categoryId: 'category-1' }]);
  rows.set(categories, [{
    id: 'category-1', name: 'Fantasy', type: 'genre', isCustom: false,
  }]);
  rows.set(act, [
    { id: 'act-2', bookId: 'book-1', title: 'Archived', position: 1, status: 'archived', summary: null },
    { id: 'act-1', bookId: 'book-1', title: 'Active', position: 0, status: 'active', summary: null },
  ]);
  rows.set(chapter, [{
    id: 'chapter-1', bookId: 'book-1', actId: 'act-1', title: 'Chapter', position: 0,
    status: 'active', archiveParentTitle: null, summary: null,
  }]);
  rows.set(scene, [{
    id: 'scene-1', bookId: 'book-1', chapterId: 'chapter-1', title: 'Scene', position: 0,
    status: 'active', archiveParentTitle: null, prose: { type: 'doc', content: [] }, summary: null,
    wordCount: 0, includeInContext: true, pointOfViewOverride: null,
    povCharacterIdOverride: null,
  }]);
  rows.set(codexEntries, [{
    id: 'codex-1', bookId: 'book-1', type: 'character', name: 'Ada', alias: null,
    description: null, image: Buffer.from('portrait'), status: 'active',
    trackingSetting: 'include_when_detected', createdAt, lastEditedAt,
  }]);
  rows.set(codexEntryNotes, [{
    id: 'note-1', codexEntryId: 'codex-1', content: 'Note', createdAt, lastEditedAt,
  }]);
  rows.set(codexEntryProgression, [{
    id: 'progression-1', codexEntryId: 'codex-1', title: 'Change', description: 'Changed',
    sceneId: 'scene-1', createdAt, lastEditedAt,
  }]);
  rows.set(chatThreads, [{
    id: 'thread-1', bookId: 'book-1', title: 'Chat', status: 'active', lastModelId: null,
    createdAt, lastEditedAt,
  }]);
  rows.set(chatMessages, [{
    id: 'message-1', threadId: 'thread-1', parentMessageId: null, branchGroupId: 'branch-1',
    branchOrder: 0, role: 'user', content: 'Hello', status: 'complete', position: 0,
    modelId: null, provider: null, inputTokens: null, outputTokens: null,
    reasoningSummary: null, error: null, createdAt, lastEditedAt,
  }]);
  rows.set(chatBranchSelections, [{
    threadId: 'thread-1', branchGroupId: 'branch-1', selectedMessageId: 'message-1',
  }]);
  rows.set(systemPromptPresets, [{
    id: 'book-preset', name: 'Book prompt', systemPrompt: 'Write.', category: 'chat',
    scope: 'book', bookId: 'book-1', temperature: 0.5, topP: 1, maxOutputTokens: null,
    presencePenalty: 0, frequencyPenalty: 0, defaultModelId: null, createdAt, lastEditedAt,
  }]);
  rows.set(activeSystemPromptPresets, [
    { bookId: 'book-1', category: 'chat', presetId: 'book-preset' },
    { bookId: 'book-1', category: 'title', presetId: 'default-title' },
    { bookId: 'book-1', category: 'summary', presetId: 'global-preset' },
  ]);
  return rows;
}

function emptyRows(): Map<unknown, unknown[]> {
  const rows = new Map<unknown, unknown[]>();
  for (const table of [
    books,
    bookSettings,
    bookTags,
    categories,
    act,
    chapter,
    scene,
    codexEntries,
    codexEntryNotes,
    codexEntryProgression,
    chatThreads,
    chatMessages,
    chatBranchSelections,
    systemPromptPresets,
    activeSystemPromptPresets,
  ]) {
    rows.set(table, []);
  }

  return rows;
}

function bookRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'book-1', title: 'Book', author: 'Author', status: 'draft', synopsis: null,
    language: 'english', coverImage: Buffer.from('cover'), wordCount: 0, createdAt,
    lastEditedAt, ...overrides,
  };
}
