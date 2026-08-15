import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../../db';
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
} from '../../../db/schema';
import { findBuiltInSystemPromptPreset } from '../../../shared/constants/ai-system-prompts';
import type {
  DataExportActiveSystemPromptPreset,
  DataExportBook,
  DataExportChatMessage,
  DataExportChatThread,
  DataExportCodexEntry,
  DataExportCodexEntryNote,
  DataExportCodexEntryProgression,
  DataExportSnapshot,
  DataExportSnapshotData,
  DataExportSystemPromptPreset,
} from './models';

type DataExportDatabase = typeof db;
type DataExportTransaction = Parameters<Parameters<DataExportDatabase['transaction']>[0]>[0];

interface DataExportServiceDependencies {
  database: DataExportDatabase;
  now: () => Date;
}

interface SnapshotRows extends Omit<
  DataExportSnapshotData,
  | 'books'
  | 'codexEntries'
  | 'codexEntryNotes'
  | 'codexEntryProgression'
  | 'chatThreads'
  | 'chatMessages'
  | 'systemPromptPresets'
> {
  books: (typeof books.$inferSelect)[];
  codexEntries: (typeof codexEntries.$inferSelect)[];
  codexEntryNotes: (typeof codexEntryNotes.$inferSelect)[];
  codexEntryProgression: (typeof codexEntryProgression.$inferSelect)[];
  chatThreads: (typeof chatThreads.$inferSelect)[];
  chatMessages: (typeof chatMessages.$inferSelect)[];
  systemPromptPresets: (typeof systemPromptPresets.$inferSelect)[];
}

/** Builds portable snapshots for a single book project or the complete library. */
export class DataExportService {
  private readonly database: DataExportDatabase;
  private readonly now: () => Date;

  constructor({
    database = db,
    now = () => new Date(),
  }: Partial<DataExportServiceDependencies> = {}) {
    this.database = database;
    this.now = now;
  }

  async createBookExport(bookId: string): Promise<DataExportSnapshot> {
    const rows = this.database.transaction((transaction) => {
      const exportedBooks = transaction
        .select()
        .from(books)
        .where(eq(books.id, bookId))
        .all();

      if (exportedBooks.length === 0) {
        throw new Error(`Data export book not found: "${bookId}".`);
      }

      return this.readSnapshotRows(transaction, exportedBooks);
    });

    return this.createSnapshot({ type: 'book', bookId }, rows);
  }

  async createLibraryExport(): Promise<DataExportSnapshot> {
    const rows = this.database.transaction((transaction) => {
      const exportedBooks = transaction.select().from(books).all();
      return this.readSnapshotRows(transaction, exportedBooks);
    });

    return this.createSnapshot({ type: 'library' }, rows);
  }

  private readSnapshotRows(
    transaction: DataExportTransaction,
    exportedBooks: (typeof books.$inferSelect)[],
  ): SnapshotRows {
    const bookIds = exportedBooks.map((book) => book.id);
    if (bookIds.length === 0) {
      return this.emptyRows();
    }

    const exportedBookSettings = transaction
      .select()
      .from(bookSettings)
      .where(inArray(bookSettings.bookSettingId, bookIds))
      .all();
    const exportedBookTags = transaction
      .select()
      .from(bookTags)
      .where(inArray(bookTags.bookId, bookIds))
      .all();
    const categoryIds = [...new Set(exportedBookTags.map((tag) => tag.categoryId))];
    const exportedCategories = categoryIds.length > 0
      ? transaction.select().from(categories).where(inArray(categories.id, categoryIds)).all()
      : [];
    const exportedActs = transaction
      .select()
      .from(act)
      .where(inArray(act.bookId, bookIds))
      .all();
    const exportedChapters = transaction
      .select()
      .from(chapter)
      .where(inArray(chapter.bookId, bookIds))
      .all();
    const exportedScenes = transaction
      .select()
      .from(scene)
      .where(inArray(scene.bookId, bookIds))
      .all();
    const exportedCodexEntries = transaction
      .select()
      .from(codexEntries)
      .where(inArray(codexEntries.bookId, bookIds))
      .all();
    const codexEntryIds = exportedCodexEntries.map((entry) => entry.id);
    const exportedCodexEntryNotes = codexEntryIds.length > 0
      ? transaction
        .select()
        .from(codexEntryNotes)
        .where(inArray(codexEntryNotes.codexEntryId, codexEntryIds))
        .all()
      : [];
    const exportedCodexEntryProgression = codexEntryIds.length > 0
      ? transaction
        .select()
        .from(codexEntryProgression)
        .where(inArray(codexEntryProgression.codexEntryId, codexEntryIds))
        .all()
      : [];
    const exportedChatThreads = transaction
      .select()
      .from(chatThreads)
      .where(inArray(chatThreads.bookId, bookIds))
      .all();
    const chatThreadIds = exportedChatThreads.map((thread) => thread.id);
    const exportedChatMessages = chatThreadIds.length > 0
      ? transaction
        .select()
        .from(chatMessages)
        .where(inArray(chatMessages.threadId, chatThreadIds))
        .all()
      : [];
    const exportedChatBranchSelections = chatThreadIds.length > 0
      ? transaction
        .select()
        .from(chatBranchSelections)
        .where(inArray(chatBranchSelections.threadId, chatThreadIds))
        .all()
      : [];
    const exportedSystemPromptPresets = transaction
      .select()
      .from(systemPromptPresets)
      .where(
        and(
          eq(systemPromptPresets.scope, 'book'),
          inArray(systemPromptPresets.bookId, bookIds),
        ),
      )
      .all();
    const exportedPresetIds = new Set(exportedSystemPromptPresets.map((preset) => preset.id));
    const exportedActiveSystemPromptPresets = transaction
      .select()
      .from(activeSystemPromptPresets)
      .where(inArray(activeSystemPromptPresets.bookId, bookIds))
      .all()
      .filter((selection) => {
        const builtInPreset = findBuiltInSystemPromptPreset(selection.presetId);
        return exportedPresetIds.has(selection.presetId)
          || builtInPreset?.category === selection.category;
      });

    return {
      books: exportedBooks,
      bookSettings: exportedBookSettings,
      categories: exportedCategories,
      bookTags: exportedBookTags,
      acts: exportedActs,
      chapters: exportedChapters,
      scenes: exportedScenes,
      codexEntries: exportedCodexEntries,
      codexEntryNotes: exportedCodexEntryNotes,
      codexEntryProgression: exportedCodexEntryProgression,
      chatThreads: exportedChatThreads,
      chatMessages: exportedChatMessages,
      chatBranchSelections: exportedChatBranchSelections,
      systemPromptPresets: exportedSystemPromptPresets,
      activeSystemPromptPresets: exportedActiveSystemPromptPresets,
    };
  }

  private createSnapshot(
    scope: DataExportSnapshot['scope'],
    rows: SnapshotRows,
  ): DataExportSnapshot {
    return {
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      scope,
      data: {
        books: this.sortBy(rows.books.map((book) => this.serializeBook(book)), 'id'),
        bookSettings: this.sortBy(rows.bookSettings, 'bookSettingId'),
        categories: [...rows.categories].sort((left, right) =>
          this.compare(left.type, right.type)
          || this.compare(left.name, right.name)
          || this.compare(left.id, right.id),
        ),
        bookTags: [...rows.bookTags].sort((left, right) =>
          this.compare(left.bookId, right.bookId)
          || this.compare(left.categoryId, right.categoryId),
        ),
        acts: this.sortPositioned(rows.acts, 'bookId'),
        chapters: this.sortPositioned(rows.chapters, 'bookId'),
        scenes: this.sortPositioned(rows.scenes, 'bookId'),
        codexEntries: [...rows.codexEntries]
          .map((entry) => this.serializeCodexEntry(entry))
          .sort((left, right) =>
            this.compare(left.bookId, right.bookId)
            || this.compare(left.type, right.type)
            || this.compare(left.name, right.name)
            || this.compare(left.id, right.id),
          ),
        codexEntryNotes: this.sortByCreatedAt(
          rows.codexEntryNotes.map((note) => this.serializeCodexEntryNote(note)),
          'codexEntryId',
        ),
        codexEntryProgression: this.sortByCreatedAt(
          rows.codexEntryProgression.map((progression) =>
            this.serializeCodexEntryProgression(progression),
          ),
          'codexEntryId',
        ),
        chatThreads: this.sortByCreatedAt(
          rows.chatThreads.map((thread) => this.serializeChatThread(thread)),
          'bookId',
        ),
        chatMessages: [...rows.chatMessages]
          .map((message) => this.serializeChatMessage(message))
          .sort((left, right) =>
            this.compare(left.threadId, right.threadId)
            || left.position - right.position
            || left.branchOrder - right.branchOrder
            || this.compare(left.id, right.id),
          ),
        chatBranchSelections: [...rows.chatBranchSelections].sort((left, right) =>
          this.compare(left.threadId, right.threadId)
          || this.compare(left.branchGroupId, right.branchGroupId),
        ),
        systemPromptPresets: [...rows.systemPromptPresets]
          .map((preset) => this.serializeSystemPromptPreset(preset))
          .sort((left, right) =>
            this.compare(left.bookId ?? '', right.bookId ?? '')
            || this.compare(left.category, right.category)
            || this.compare(left.createdAt, right.createdAt)
            || this.compare(left.id, right.id),
          ),
        activeSystemPromptPresets: [...rows.activeSystemPromptPresets].sort((left, right) =>
          this.compare(left.bookId, right.bookId)
          || this.compare(left.category, right.category),
        ),
      },
    };
  }

  private emptyRows(): SnapshotRows {
    return {
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
    };
  }

  private serializeBook(book: typeof books.$inferSelect): DataExportBook {
    return {
      ...book,
      coverImage: this.encodeBlob(book.coverImage),
      createdAt: book.createdAt?.toISOString() ?? null,
      lastEditedAt: book.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeCodexEntry(entry: typeof codexEntries.$inferSelect): DataExportCodexEntry {
    return {
      ...entry,
      image: this.encodeBlob(entry.image),
      createdAt: entry.createdAt?.toISOString() ?? null,
      lastEditedAt: entry.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeCodexEntryNote(
    note: typeof codexEntryNotes.$inferSelect,
  ): DataExportCodexEntryNote {
    return {
      ...note,
      createdAt: note.createdAt?.toISOString() ?? null,
      lastEditedAt: note.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeCodexEntryProgression(
    progression: typeof codexEntryProgression.$inferSelect,
  ): DataExportCodexEntryProgression {
    return {
      ...progression,
      createdAt: progression.createdAt?.toISOString() ?? null,
      lastEditedAt: progression.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeChatThread(thread: typeof chatThreads.$inferSelect): DataExportChatThread {
    return {
      ...thread,
      createdAt: thread.createdAt?.toISOString() ?? null,
      lastEditedAt: thread.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeChatMessage(message: typeof chatMessages.$inferSelect): DataExportChatMessage {
    return {
      ...message,
      createdAt: message.createdAt?.toISOString() ?? null,
      lastEditedAt: message.lastEditedAt?.toISOString() ?? null,
    };
  }

  private serializeSystemPromptPreset(
    preset: typeof systemPromptPresets.$inferSelect,
  ): DataExportSystemPromptPreset {
    return {
      ...preset,
      createdAt: preset.createdAt.toISOString(),
      lastEditedAt: preset.lastEditedAt.toISOString(),
    };
  }

  private encodeBlob(value: unknown): string | null {
    if (value === null) {
      return null;
    }

    if (!Buffer.isBuffer(value)) {
      throw new Error('Data export encountered an unsupported binary value.');
    }

    return value.toString('base64');
  }

  private sortBy<Row extends Record<Key, string>, Key extends keyof Row>(
    rows: Row[],
    key: Key,
  ): Row[] {
    return [...rows].sort((left, right) => this.compare(left[key], right[key]));
  }

  private sortPositioned<
    Row extends { id: string; position: number } & Record<Key, string>,
    Key extends keyof Row,
  >(rows: Row[], parentKey: Key): Row[] {
    return [...rows].sort((left, right) =>
      this.compare(left[parentKey], right[parentKey])
      || left.position - right.position
      || this.compare(left.id, right.id),
    );
  }

  private sortByCreatedAt<
    Row extends { id: string; createdAt: string | null } & Record<Key, string>,
    Key extends keyof Row,
  >(rows: Row[], parentKey: Key): Row[] {
    return [...rows].sort((left, right) =>
      this.compare(left[parentKey], right[parentKey])
      || this.compare(left.createdAt ?? '', right.createdAt ?? '')
      || this.compare(left.id, right.id),
    );
  }

  private compare(left: string, right: string): number {
    return left.localeCompare(right);
  }
}

export const dataExportService = new DataExportService();
