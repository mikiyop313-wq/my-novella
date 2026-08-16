import { db, type AppDatabase, type DatabaseTransaction } from '../../../db';
import type {
  ActRow,
  ActiveSystemPromptPresetRow,
  BookRow,
  BookSettingsRow,
  BookTagRow,
  CategoryRow,
  ChapterRow,
  ChatBranchSelectionRow,
  ChatMessageRow,
  ChatThreadRow,
  CodexEntryNoteRow,
  CodexEntryProgressionRow,
  CodexEntryRow,
  SceneRow,
  SystemPromptPresetRow,
} from '../../../db/schema';
import {
  fromSqliteBoolean,
  fromSqliteTimestamp,
  parseSqliteJson,
} from '../../../db/core/sqlite-values';
import { findBuiltInSystemPromptPreset } from '../../../shared/constants/ai-system-prompts';
import type { TiptapJsonDoc } from '../../../shared/models/manuscript.model';
import type {
  DataExportBook,
  DataExportBookSettings,
  DataExportCategory,
  DataExportChatMessage,
  DataExportChatThread,
  DataExportCodexEntry,
  DataExportCodexEntryNote,
  DataExportCodexEntryProgression,
  DataExportScene,
  DataExportSnapshot,
  DataExportSnapshotData,
  DataExportSystemPromptPreset,
} from './models';

interface DataExportServiceDependencies {
  database: AppDatabase;
  now: () => Date;
}

interface SnapshotRows {
  books: BookRow[];
  bookSettings: BookSettingsRow[];
  categories: CategoryRow[];
  bookTags: BookTagRow[];
  acts: ActRow[];
  chapters: ChapterRow[];
  scenes: SceneRow[];
  codexEntries: CodexEntryRow[];
  codexEntryNotes: CodexEntryNoteRow[];
  codexEntryProgression: CodexEntryProgressionRow[];
  chatThreads: ChatThreadRow[];
  chatMessages: ChatMessageRow[];
  chatBranchSelections: ChatBranchSelectionRow[];
  systemPromptPresets: SystemPromptPresetRow[];
  activeSystemPromptPresets: ActiveSystemPromptPresetRow[];
}

export class DataExportService {
  private readonly database: AppDatabase;
  private readonly now: () => Date;

  constructor({ database = db, now = () => new Date() }: Partial<DataExportServiceDependencies> = {}) {
    this.database = database;
    this.now = now;
  }

  async createBookExport(bookId: string): Promise<DataExportSnapshot> {
    const rows = await this.database.transaction().execute(async (transaction) => {
      const books = await transaction.selectFrom('books').selectAll().where('id', '=', bookId).execute();
      if (books.length === 0) throw new Error(`Data export book not found: "${bookId}".`);
      return this.readSnapshotRows(transaction, books);
    });
    return this.createSnapshot({ type: 'book', bookId }, rows);
  }

  async createLibraryExport(): Promise<DataExportSnapshot> {
    const rows = await this.database.transaction().execute(async (transaction) => {
      const books = await transaction.selectFrom('books').selectAll().execute();
      return this.readSnapshotRows(transaction, books);
    });
    return this.createSnapshot({ type: 'library' }, rows);
  }

  private async readSnapshotRows(transaction: DatabaseTransaction, books: BookRow[]): Promise<SnapshotRows> {
    const bookIds = books.map(({ id }) => id);
    if (bookIds.length === 0) return this.emptyRows();
    const bookSettings = await transaction.selectFrom('bookSettings').selectAll().where('bookSettingId', 'in', bookIds).execute();
    const bookTags = await transaction.selectFrom('bookTags').selectAll().where('bookId', 'in', bookIds).execute();
    const categoryIds = [...new Set(bookTags.map(({ categoryId }) => categoryId))];
    const categories = categoryIds.length > 0 ? await transaction.selectFrom('categories').selectAll().where('id', 'in', categoryIds).execute() : [];
    const acts = await transaction.selectFrom('acts').selectAll().where('bookId', 'in', bookIds).execute();
    const chapters = await transaction.selectFrom('chapters').selectAll().where('bookId', 'in', bookIds).execute();
    const scenes = await transaction.selectFrom('scenes').selectAll().where('bookId', 'in', bookIds).execute();
    const codexEntries = await transaction.selectFrom('codexEntries').selectAll().where('bookId', 'in', bookIds).execute();
    const codexIds = codexEntries.map(({ id }) => id);
    const codexEntryNotes = codexIds.length > 0 ? await transaction.selectFrom('codexEntryNotes').selectAll().where('codexEntryId', 'in', codexIds).execute() : [];
    const codexEntryProgression = codexIds.length > 0 ? await transaction.selectFrom('codexEntryProgression').selectAll().where('codexEntryId', 'in', codexIds).execute() : [];
    const chatThreads = await transaction.selectFrom('chatThreads').selectAll().where('bookId', 'in', bookIds).execute();
    const threadIds = chatThreads.map(({ id }) => id);
    const chatMessages = threadIds.length > 0 ? await transaction.selectFrom('chatMessages').selectAll().where('threadId', 'in', threadIds).execute() : [];
    const chatBranchSelections = threadIds.length > 0 ? await transaction.selectFrom('chatBranchSelections').selectAll().where('threadId', 'in', threadIds).execute() : [];
    const systemPromptPresets = await transaction.selectFrom('systemPromptPresets').selectAll().where('scope', '=', 'book').where('bookId', 'in', bookIds).execute();
    const presetIds = new Set(systemPromptPresets.map(({ id }) => id));
    const activeSelections = await transaction.selectFrom('activeSystemPromptPresets').selectAll().where('bookId', 'in', bookIds).execute();
    const activeSystemPromptPresets = activeSelections.filter((selection) => {
      const builtIn = findBuiltInSystemPromptPreset(selection.presetId);
      return presetIds.has(selection.presetId) || builtIn?.category === selection.category;
    });
    return { books, bookSettings, categories, bookTags, acts, chapters, scenes, codexEntries, codexEntryNotes, codexEntryProgression, chatThreads, chatMessages, chatBranchSelections, systemPromptPresets, activeSystemPromptPresets };
  }

  private createSnapshot(scope: DataExportSnapshot['scope'], rows: SnapshotRows): DataExportSnapshot {
    return {
      schemaVersion: 1,
      exportedAt: this.now().toISOString(),
      scope,
      data: {
        books: this.sortBy(rows.books.map((row) => this.serializeBook(row)), 'id'),
        bookSettings: this.sortBy(rows.bookSettings.map((row) => this.serializeBookSettings(row)), 'bookSettingId'),
        categories: rows.categories.map((row) => this.serializeCategory(row)).sort((left, right) => this.compare(left.type, right.type) || this.compare(left.name, right.name) || this.compare(left.id, right.id)),
        bookTags: [...rows.bookTags].sort((left, right) => this.compare(left.bookId, right.bookId) || this.compare(left.categoryId, right.categoryId)),
        acts: this.sortPositioned(rows.acts, 'bookId'),
        chapters: this.sortPositioned(rows.chapters, 'bookId'),
        scenes: this.sortPositioned(rows.scenes.map((row) => this.serializeScene(row)), 'bookId'),
        codexEntries: rows.codexEntries.map((row) => this.serializeCodexEntry(row)).sort((left, right) => this.compare(left.bookId, right.bookId) || this.compare(left.type, right.type) || this.compare(left.name, right.name) || this.compare(left.id, right.id)),
        codexEntryNotes: this.sortByCreatedAt(rows.codexEntryNotes.map((row) => this.serializeCodexEntryNote(row)), 'codexEntryId'),
        codexEntryProgression: this.sortByCreatedAt(rows.codexEntryProgression.map((row) => this.serializeCodexEntryProgression(row)), 'codexEntryId'),
        chatThreads: this.sortByCreatedAt(rows.chatThreads.map((row) => this.serializeChatThread(row)), 'bookId'),
        chatMessages: rows.chatMessages.map((row) => this.serializeChatMessage(row)).sort((left, right) => this.compare(left.threadId, right.threadId) || left.position - right.position || left.branchOrder - right.branchOrder || this.compare(left.id, right.id)),
        chatBranchSelections: [...rows.chatBranchSelections].sort((left, right) => this.compare(left.threadId, right.threadId) || this.compare(left.branchGroupId, right.branchGroupId)),
        systemPromptPresets: rows.systemPromptPresets.map((row) => this.serializeSystemPromptPreset(row)).sort((left, right) => this.compare(left.bookId ?? '', right.bookId ?? '') || this.compare(left.category, right.category) || this.compare(left.createdAt, right.createdAt) || this.compare(left.id, right.id)),
        activeSystemPromptPresets: [...rows.activeSystemPromptPresets].sort((left, right) => this.compare(left.bookId, right.bookId) || this.compare(left.category, right.category)),
      },
    };
  }

  private emptyRows(): SnapshotRows {
    return { books: [], bookSettings: [], categories: [], bookTags: [], acts: [], chapters: [], scenes: [], codexEntries: [], codexEntryNotes: [], codexEntryProgression: [], chatThreads: [], chatMessages: [], chatBranchSelections: [], systemPromptPresets: [], activeSystemPromptPresets: [] };
  }

  private serializeBook(row: BookRow): DataExportBook {
    return { ...row, coverImage: this.encodeBlob(row.coverImage), createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeBookSettings(row: BookSettingsRow): DataExportBookSettings {
    const { openrouterEmbeddingModel, ...settings } = row;
    return { ...settings, synopsisAiContext: fromSqliteBoolean(row.synopsisAiContext), openRouterEmbeddingModel: openrouterEmbeddingModel, vectorSearchEnabled: fromSqliteBoolean(row.vectorSearchEnabled), vectorSearchThresholdEnabled: fromSqliteBoolean(row.vectorSearchThresholdEnabled), vectorSearchManualSelectionEnabled: fromSqliteBoolean(row.vectorSearchManualSelectionEnabled), automaticIndexingEnabled: fromSqliteBoolean(row.automaticIndexingEnabled) };
  }

  private serializeCategory(row: CategoryRow): DataExportCategory {
    return { ...row, isCustom: fromSqliteBoolean(row.isCustom) };
  }

  private serializeScene(row: SceneRow): DataExportScene {
    return { ...row, prose: parseSqliteJson<TiptapJsonDoc>(row.prose), includeInContext: fromSqliteBoolean(row.includeInContext) };
  }

  private serializeCodexEntry(row: CodexEntryRow): DataExportCodexEntry {
    return { ...row, image: this.encodeBlob(row.image), createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeCodexEntryNote(row: CodexEntryNoteRow): DataExportCodexEntryNote {
    return { ...row, createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeCodexEntryProgression(row: CodexEntryProgressionRow): DataExportCodexEntryProgression {
    return { ...row, createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeChatThread(row: ChatThreadRow): DataExportChatThread {
    return { ...row, createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeChatMessage(row: ChatMessageRow): DataExportChatMessage {
    return { ...row, createdAt: this.iso(row.createdAt), lastEditedAt: this.iso(row.lastEditedAt) };
  }

  private serializeSystemPromptPreset(row: SystemPromptPresetRow): DataExportSystemPromptPreset {
    return { ...row, createdAt: this.iso(row.createdAt)!, lastEditedAt: this.iso(row.lastEditedAt)! };
  }

  private iso(value: number | null): string | null {
    return fromSqliteTimestamp(value)?.toISOString() ?? null;
  }

  private encodeBlob(value: Buffer | null): string | null {
    return value === null ? null : value.toString('base64');
  }

  private sortBy<Row extends Record<Key, string>, Key extends keyof Row>(rows: Row[], key: Key): Row[] {
    return [...rows].sort((left, right) => this.compare(left[key], right[key]));
  }

  private sortPositioned<Row extends { id: string; position: number } & Record<Key, string>, Key extends keyof Row>(rows: Row[], parentKey: Key): Row[] {
    return [...rows].sort((left, right) => this.compare(left[parentKey], right[parentKey]) || left.position - right.position || this.compare(left.id, right.id));
  }

  private sortByCreatedAt<Row extends { id: string; createdAt: string | null } & Record<Key, string>, Key extends keyof Row>(rows: Row[], parentKey: Key): Row[] {
    return [...rows].sort((left, right) => this.compare(left[parentKey], right[parentKey]) || this.compare(left.createdAt ?? '', right.createdAt ?? '') || this.compare(left.id, right.id));
  }

  private compare(left: string, right: string): number {
    return left.localeCompare(right);
  }
}

export const dataExportService = new DataExportService();
