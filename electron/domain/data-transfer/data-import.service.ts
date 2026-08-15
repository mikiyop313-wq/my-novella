import { randomUUID } from 'node:crypto';

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
import type { DataExportSnapshotData, DataImportResult } from './models';
import { validateTransferArchive } from './transfer-archive-validator';

type DataImportDatabase = typeof db;
type DataImportTransaction = Parameters<Parameters<DataImportDatabase['transaction']>[0]>[0];

interface DataImportServiceDependencies {
  database: DataImportDatabase;
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

/** Imports validated snapshots as independent copies in one database transaction. */
export class DataImportService {
  private readonly database: DataImportDatabase;
  private readonly createId: () => string;

  constructor({
    database = db,
    createId = randomUUID,
  }: Partial<DataImportServiceDependencies> = {}) {
    this.database = database;
    this.createId = createId;
  }

  async importSnapshot(snapshotValue: unknown): Promise<DataImportResult> {
    const snapshot = validateTransferArchive(snapshotValue);
    const ids = this.createIdMaps(snapshot.data);

    return this.database.transaction((transaction) => {
      const categoryIds = this.importCategories(transaction, snapshot.data);
      this.importBooks(transaction, snapshot.data, ids);
      this.importBookSettings(transaction, snapshot.data, ids);
      this.importBookTags(transaction, snapshot.data, ids, categoryIds);
      this.importNarrative(transaction, snapshot.data, ids);
      this.importCodex(transaction, snapshot.data, ids);
      this.importChats(transaction, snapshot.data, ids);
      this.importSystemPrompts(transaction, snapshot.data, ids);

      return {
        importedBookIds: snapshot.data.books.map((book) => mappedId(ids.books, book.id)),
      };
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

  private importCategories(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
  ): Map<string, string> {
    const existingCategories = transaction.select().from(categories).all();
    const categoryIdByIdentity = new Map(
      existingCategories.map((category) => [categoryIdentity(category), category.id]),
    );
    const importedCategoryIds = new Map<string, string>();

    for (const category of data.categories) {
      const identity = categoryIdentity(category);
      const existingId = categoryIdByIdentity.get(identity);
      const categoryId = existingId ?? this.createId();

      if (!existingId) {
        transaction
          .insert(categories)
          .values({ ...category, id: categoryId })
          .run();
        categoryIdByIdentity.set(identity, categoryId);
      }

      importedCategoryIds.set(category.id, categoryId);
    }

    return importedCategoryIds;
  }

  private importBooks(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const book of data.books) {
      transaction
        .insert(books)
        .values({
          ...book,
          id: mappedId(ids.books, book.id),
          coverImage: decodeBinary(book.coverImage),
          createdAt: decodeDate(book.createdAt),
          lastEditedAt: decodeDate(book.lastEditedAt),
        })
        .run();
    }
  }

  private importBookSettings(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const settings of data.bookSettings) {
      transaction
        .insert(bookSettings)
        .values({
          ...settings,
          bookSettingId: mappedId(ids.books, settings.bookSettingId),
          povCharacterId: mapNullableId(ids.codexEntries, settings.povCharacterId),
        })
        .run();
    }
  }

  private importBookTags(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
    categoryIds: Map<string, string>,
  ): void {
    for (const tag of data.bookTags) {
      transaction
        .insert(bookTags)
        .values({
          bookId: mappedId(ids.books, tag.bookId),
          categoryId: mappedId(categoryIds, tag.categoryId),
        })
        .run();
    }
  }

  private importNarrative(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const importedAct of data.acts) {
      transaction
        .insert(act)
        .values({
          ...importedAct,
          id: mappedId(ids.acts, importedAct.id),
          bookId: mappedId(ids.books, importedAct.bookId),
        })
        .run();
    }
    for (const importedChapter of data.chapters) {
      transaction
        .insert(chapter)
        .values({
          ...importedChapter,
          id: mappedId(ids.chapters, importedChapter.id),
          bookId: mappedId(ids.books, importedChapter.bookId),
          actId: mapNullableId(ids.acts, importedChapter.actId),
        })
        .run();
    }
    for (const importedScene of data.scenes) {
      transaction
        .insert(scene)
        .values({
          ...importedScene,
          id: mappedId(ids.scenes, importedScene.id),
          bookId: mappedId(ids.books, importedScene.bookId),
          chapterId: mapNullableId(ids.chapters, importedScene.chapterId),
          povCharacterIdOverride: mapNullableId(
            ids.codexEntries,
            importedScene.povCharacterIdOverride,
          ),
        })
        .run();
    }
  }

  private importCodex(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const entry of data.codexEntries) {
      transaction
        .insert(codexEntries)
        .values({
          ...entry,
          id: mappedId(ids.codexEntries, entry.id),
          bookId: mappedId(ids.books, entry.bookId),
          image: decodeBinary(entry.image),
          createdAt: decodeDate(entry.createdAt),
          lastEditedAt: decodeDate(entry.lastEditedAt),
        })
        .run();
    }
    for (const note of data.codexEntryNotes) {
      transaction
        .insert(codexEntryNotes)
        .values({
          ...note,
          id: mappedId(ids.codexEntryNotes, note.id),
          codexEntryId: mappedId(ids.codexEntries, note.codexEntryId),
          createdAt: decodeDate(note.createdAt),
          lastEditedAt: decodeDate(note.lastEditedAt),
        })
        .run();
    }
    for (const progression of data.codexEntryProgression) {
      transaction
        .insert(codexEntryProgression)
        .values({
          ...progression,
          id: mappedId(ids.codexEntryProgression, progression.id),
          codexEntryId: mappedId(ids.codexEntries, progression.codexEntryId),
          sceneId: mapNullableId(ids.scenes, progression.sceneId),
          createdAt: decodeDate(progression.createdAt),
          lastEditedAt: decodeDate(progression.lastEditedAt),
        })
        .run();
    }
  }

  private importChats(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const thread of data.chatThreads) {
      transaction
        .insert(chatThreads)
        .values({
          ...thread,
          id: mappedId(ids.chatThreads, thread.id),
          bookId: mappedId(ids.books, thread.bookId),
          createdAt: decodeDate(thread.createdAt),
          lastEditedAt: decodeDate(thread.lastEditedAt),
        })
        .run();
    }
    for (const message of data.chatMessages) {
      transaction
        .insert(chatMessages)
        .values({
          ...message,
          id: mappedId(ids.chatMessages, message.id),
          threadId: mappedId(ids.chatThreads, message.threadId),
          parentMessageId: mapNullableId(ids.chatMessages, message.parentMessageId),
          branchGroupId: mappedId(ids.chatBranchGroups, branchGroupIdentity(message)),
          createdAt: decodeDate(message.createdAt),
          lastEditedAt: decodeDate(message.lastEditedAt),
        })
        .run();
    }
    for (const selection of data.chatBranchSelections) {
      transaction
        .insert(chatBranchSelections)
        .values({
          ...selection,
          threadId: mappedId(ids.chatThreads, selection.threadId),
          branchGroupId: mappedId(ids.chatBranchGroups, branchGroupIdentity(selection)),
          selectedMessageId: mappedId(ids.chatMessages, selection.selectedMessageId),
        })
        .run();
    }
  }

  private importSystemPrompts(
    transaction: DataImportTransaction,
    data: DataExportSnapshotData,
    ids: ImportIdMaps,
  ): void {
    for (const preset of data.systemPromptPresets) {
      transaction
        .insert(systemPromptPresets)
        .values({
          ...preset,
          id: mappedId(ids.systemPromptPresets, preset.id),
          bookId: mappedId(ids.books, preset.bookId as string),
          createdAt: new Date(preset.createdAt),
          lastEditedAt: new Date(preset.lastEditedAt),
        })
        .run();
    }
    for (const selection of data.activeSystemPromptPresets) {
      if (!findBuiltInSystemPromptPreset(selection.presetId)) {
        transaction
          .insert(activeSystemPromptPresets)
          .values({
            ...selection,
            bookId: mappedId(ids.books, selection.bookId),
            presetId: mappedId(ids.systemPromptPresets, selection.presetId),
          })
          .run();
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

function decodeDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

export const dataImportService = new DataImportService();
