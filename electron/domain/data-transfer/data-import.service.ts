import { randomUUID } from 'node:crypto';

import { db, type AppDatabase, type DatabaseTransaction } from '../../../db';
import {
  serializeSqliteJson,
  toSqliteBoolean,
  toSqliteTimestamp,
} from '../../../db/core/sqlite-values';
import { findBuiltInSystemPromptPreset } from '../../../shared/constants/ai-system-prompts';
import type { DataExportSnapshotData, DataImportResult } from './models';
import { validateTransferArchive } from './transfer-archive-validator';

interface DataImportServiceDependencies {
  database: AppDatabase;
  createId: () => string;
}

interface ImportIdMaps {
  books: Map<string, string>;
  acts: Map<string, string>;
  chapters: Map<string, string>;
  scenes: Map<string, string>;
  codexEntries: Map<string, string>;
  codexEntryNotes: Map<string, string>;
  codexEntryProgression: Map<string, string>;
  chatThreads: Map<string, string>;
  chatMessages: Map<string, string>;
  chatBranchGroups: Map<string, string>;
  systemPromptPresets: Map<string, string>;
}

export class DataImportService {
  private readonly database: AppDatabase;
  private readonly createId: () => string;

  constructor({ database = db, createId = randomUUID }: Partial<DataImportServiceDependencies> = {}) {
    this.database = database;
    this.createId = createId;
  }

  async importSnapshot(snapshotValue: unknown): Promise<DataImportResult> {
    const snapshot = validateTransferArchive(snapshotValue);
    const ids = this.createIdMaps(snapshot.data);
    return this.database.transaction().execute(async (transaction) => {
      const categoryIds = await this.importCategories(transaction, snapshot.data);
      await this.importBooks(transaction, snapshot.data, ids);
      await this.importBookSettings(transaction, snapshot.data, ids);
      await this.importBookTags(transaction, snapshot.data, ids, categoryIds);
      await this.importNarrative(transaction, snapshot.data, ids);
      await this.importCodex(transaction, snapshot.data, ids);
      await this.importChats(transaction, snapshot.data, ids);
      await this.importSystemPrompts(transaction, snapshot.data, ids);
      return { importedBookIds: snapshot.data.books.map((book) => mappedId(ids.books, book.id)) };
    });
  }

  private createIdMaps(data: DataExportSnapshotData): ImportIdMaps {
    return {
      books: this.mapNewIds(data.books),
      acts: this.mapNewIds(data.acts),
      chapters: this.mapNewIds(data.chapters),
      scenes: this.mapNewIds(data.scenes),
      codexEntries: this.mapNewIds(data.codexEntries),
      codexEntryNotes: this.mapNewIds(data.codexEntryNotes),
      codexEntryProgression: this.mapNewIds(data.codexEntryProgression),
      chatThreads: this.mapNewIds(data.chatThreads),
      chatMessages: this.mapNewIds(data.chatMessages),
      chatBranchGroups: this.mapBranchGroupIds(data),
      systemPromptPresets: this.mapNewIds(data.systemPromptPresets),
    };
  }

  private mapNewIds(rows: { id: string }[]): Map<string, string> {
    return new Map(rows.map((row) => [row.id, this.createId()]));
  }

  private mapBranchGroupIds(data: DataExportSnapshotData): Map<string, string> {
    const identities = new Set(data.chatMessages.map(branchGroupIdentity));
    return new Map([...identities].map((identity) => [identity, this.createId()]));
  }

  private async importCategories(transaction: DatabaseTransaction, data: DataExportSnapshotData): Promise<Map<string, string>> {
    const existing = await transaction.selectFrom('categories').selectAll().execute();
    const byIdentity = new Map(existing.map((category) => [categoryIdentity(category), category.id]));
    const importedIds = new Map<string, string>();
    for (const category of data.categories) {
      const identity = categoryIdentity(category);
      const existingId = byIdentity.get(identity);
      const categoryId = existingId ?? this.createId();
      if (!existingId) {
        await transaction.insertInto('categories').values({ ...category, id: categoryId, isCustom: toSqliteBoolean(category.isCustom) }).execute();
        byIdentity.set(identity, categoryId);
      }
      importedIds.set(category.id, categoryId);
    }
    return importedIds;
  }

  private async importBooks(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const book of data.books) {
      await transaction.insertInto('books').values({ ...book, id: mappedId(ids.books, book.id), coverImage: decodeBinary(book.coverImage), createdAt: decodeDate(book.createdAt), lastEditedAt: decodeDate(book.lastEditedAt) }).execute();
    }
  }

  private async importBookSettings(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const settings of data.bookSettings) {
      const { openRouterEmbeddingModel, ...values } = settings;
      await transaction.insertInto('bookSettings').values({
        ...values,
        bookSettingId: mappedId(ids.books, settings.bookSettingId),
        synopsisAiContext: toSqliteBoolean(settings.synopsisAiContext),
        povCharacterId: mapNullableId(ids.codexEntries, settings.povCharacterId),
        openrouterEmbeddingModel: openRouterEmbeddingModel,
        vectorSearchEnabled: toSqliteBoolean(settings.vectorSearchEnabled),
        vectorSearchThresholdEnabled: toSqliteBoolean(settings.vectorSearchThresholdEnabled),
        vectorSearchManualSelectionEnabled: toSqliteBoolean(
          settings.vectorSearchManualSelectionEnabled,
        ),
        automaticIndexingEnabled: toSqliteBoolean(settings.automaticIndexingEnabled),
      }).execute();
    }
  }

  private async importBookTags(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps, categoryIds: Map<string, string>): Promise<void> {
    for (const tag of data.bookTags) {
      await transaction.insertInto('bookTags').values({ bookId: mappedId(ids.books, tag.bookId), categoryId: mappedId(categoryIds, tag.categoryId) }).execute();
    }
  }

  private async importNarrative(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const act of data.acts) {
      await transaction.insertInto('acts').values({ ...act, id: mappedId(ids.acts, act.id), bookId: mappedId(ids.books, act.bookId) }).execute();
    }
    for (const chapter of data.chapters) {
      await transaction.insertInto('chapters').values({ ...chapter, id: mappedId(ids.chapters, chapter.id), bookId: mappedId(ids.books, chapter.bookId), actId: mapNullableId(ids.acts, chapter.actId) }).execute();
    }
    for (const scene of data.scenes) {
      await transaction.insertInto('scenes').values({
        ...scene,
        id: mappedId(ids.scenes, scene.id),
        bookId: mappedId(ids.books, scene.bookId),
        chapterId: mapNullableId(ids.chapters, scene.chapterId),
        prose: serializeSqliteJson(scene.prose),
        includeInContext: toSqliteBoolean(scene.includeInContext),
        povCharacterIdOverride: mapNullableId(ids.codexEntries, scene.povCharacterIdOverride),
      }).execute();
    }
  }

  private async importCodex(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const entry of data.codexEntries) {
      await transaction.insertInto('codexEntries').values({ ...entry, id: mappedId(ids.codexEntries, entry.id), bookId: mappedId(ids.books, entry.bookId), image: decodeBinary(entry.image), createdAt: decodeDate(entry.createdAt), lastEditedAt: decodeDate(entry.lastEditedAt) }).execute();
    }
    for (const note of data.codexEntryNotes) {
      await transaction.insertInto('codexEntryNotes').values({ ...note, id: mappedId(ids.codexEntryNotes, note.id), codexEntryId: mappedId(ids.codexEntries, note.codexEntryId), createdAt: decodeDate(note.createdAt), lastEditedAt: decodeDate(note.lastEditedAt) }).execute();
    }
    for (const progression of data.codexEntryProgression) {
      await transaction.insertInto('codexEntryProgression').values({ ...progression, id: mappedId(ids.codexEntryProgression, progression.id), codexEntryId: mappedId(ids.codexEntries, progression.codexEntryId), sceneId: mapNullableId(ids.scenes, progression.sceneId), createdAt: decodeDate(progression.createdAt), lastEditedAt: decodeDate(progression.lastEditedAt) }).execute();
    }
  }

  private async importChats(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const thread of data.chatThreads) {
      await transaction.insertInto('chatThreads').values({ ...thread, id: mappedId(ids.chatThreads, thread.id), bookId: mappedId(ids.books, thread.bookId), createdAt: decodeDate(thread.createdAt), lastEditedAt: decodeDate(thread.lastEditedAt) }).execute();
    }
    for (const message of data.chatMessages) {
      await transaction.insertInto('chatMessages').values({ ...message, id: mappedId(ids.chatMessages, message.id), threadId: mappedId(ids.chatThreads, message.threadId), parentMessageId: mapNullableId(ids.chatMessages, message.parentMessageId), branchGroupId: mappedId(ids.chatBranchGroups, branchGroupIdentity(message)), createdAt: decodeDate(message.createdAt), lastEditedAt: decodeDate(message.lastEditedAt) }).execute();
    }
    for (const selection of data.chatBranchSelections) {
      await transaction.insertInto('chatBranchSelections').values({ ...selection, threadId: mappedId(ids.chatThreads, selection.threadId), branchGroupId: mappedId(ids.chatBranchGroups, branchGroupIdentity(selection)), selectedMessageId: mappedId(ids.chatMessages, selection.selectedMessageId) }).execute();
    }
  }

  private async importSystemPrompts(transaction: DatabaseTransaction, data: DataExportSnapshotData, ids: ImportIdMaps): Promise<void> {
    for (const preset of data.systemPromptPresets) {
      await transaction.insertInto('systemPromptPresets').values({ ...preset, id: mappedId(ids.systemPromptPresets, preset.id), bookId: mappedId(ids.books, preset.bookId!), createdAt: decodeDate(preset.createdAt)!, lastEditedAt: decodeDate(preset.lastEditedAt)! }).execute();
    }
    for (const selection of data.activeSystemPromptPresets) {
      if (!findBuiltInSystemPromptPreset(selection.presetId)) {
        await transaction.insertInto('activeSystemPromptPresets').values({ ...selection, bookId: mappedId(ids.books, selection.bookId), presetId: mappedId(ids.systemPromptPresets, selection.presetId) }).execute();
      }
    }
  }
}

function categoryIdentity(category: { name: string; type: string }): string {
  return `${category.type}\0${category.name}`;
}

function branchGroupIdentity(value: { threadId: string; branchGroupId: string }): string {
  return `${value.threadId}\0${value.branchGroupId}`;
}

function mappedId(ids: Map<string, string>, originalId: string): string {
  const importedId = ids.get(originalId);
  if (!importedId) throw new Error(`Missing validated import ID mapping for "${originalId}".`);
  return importedId;
}

function mapNullableId(ids: Map<string, string>, originalId: string | null): string | null {
  return originalId === null ? null : mappedId(ids, originalId);
}

function decodeBinary(value: string | null): Buffer | null {
  return value === null ? null : Buffer.from(value, 'base64');
}

function decodeDate(value: string | null): number | null {
  return value === null ? null : toSqliteTimestamp(new Date(value));
}

export const dataImportService = new DataImportService();
