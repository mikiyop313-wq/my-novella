import { randomUUID } from 'crypto';
import { sql } from 'kysely';

import {
  type BookDto,
  type BookSettingsDto,
  type CategoryDto,
  type CreateBookDto,
  type UpdateBookDto,
} from '../../shared/models/book.model';
import type {
  EmbeddingModel,
  LocalEmbeddingModelName,
  OpenRouterEmbeddingModelName,
  ResolvedBookEmbeddingSelection,
  VectorCloudProviderId,
} from '../../shared/models/vector.model';
import { db } from '../index';
import type {
  BookRow,
  BookSettingsRow,
  BookSettingsUpdate,
  NewBookSettingsRow,
} from '../schema';
import {
  fromSqliteBoolean,
  fromSqliteTimestamp,
  toIpcBinary,
  toSqliteBoolean,
  toSqliteTimestamp,
} from '../core/sqlite-values';

type CoverImageInput = BookDto['coverImage'] | undefined;
type BookWithRelations = BookRow & {
  categories: CategoryDto[];
  settings?: BookSettingsRow;
};

export class BookRepository {
  private mapToDto(book: BookWithRelations): BookDto {
    const createdAt = fromSqliteTimestamp(book.createdAt);
    const lastEditedAt = fromSqliteTimestamp(book.lastEditedAt);

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      status: book.status,
      synopsis: book.synopsis,
      language: book.language,
      coverImage: toIpcBinary(book.coverImage),
      wordCount: book.wordCount ?? 0,
      createdAt: (createdAt ?? new Date(0)).toISOString(),
      lastEditedAt: (lastEditedAt ?? new Date(0)).toISOString(),
      categories: book.categories,
      ...(book.settings ? { settings: this.mapSettingsToDto(book.settings) } : {}),
    };
  }

  private mapSettingsToDto(settings: BookSettingsRow): BookSettingsDto {
    return {
      language: settings.language,
      proseTense: settings.proseTense,
      pointOfView: settings.pointOfView,
      synopsisAiContext: fromSqliteBoolean(settings.synopsisAiContext),
      povCharacterId: settings.povCharacterId,
      embeddingModel: settings.embeddingModel,
      localEmbeddingModel: settings.localEmbeddingModel,
      openRouterEmbeddingModel: settings.openrouterEmbeddingModel,
      vectorSearchEnabled: fromSqliteBoolean(settings.vectorSearchEnabled),
      automaticIndexingEnabled: fromSqliteBoolean(settings.automaticIndexingEnabled),
    };
  }

  private dataUrlToBuffer(value: CoverImageInput): Buffer | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'string') {
      if (!value.startsWith('data:')) {
        return Buffer.from(value);
      }
      return Buffer.from(value.split(',')[1], 'base64');
    }
    return Buffer.from(value);
  }

  private async loadRelations(bookRows: BookRow[]): Promise<BookWithRelations[]> {
    if (bookRows.length === 0) {
      return [];
    }

    const bookIds = bookRows.map(({ id }) => id);
    const [settingsRows, tagRows] = await Promise.all([
      db.selectFrom('bookSettings').selectAll().where('bookSettingId', 'in', bookIds).execute(),
      db
        .selectFrom('bookTags')
        .innerJoin('categories', 'categories.id', 'bookTags.categoryId')
        .select([
          'bookTags.bookId',
          'categories.id',
          'categories.name',
          'categories.type',
          'categories.isCustom',
        ])
        .where('bookTags.bookId', 'in', bookIds)
        .execute(),
    ]);
    const settingsByBookId = new Map(settingsRows.map((row) => [row.bookSettingId, row]));
    const categoriesByBookId = new Map<string, CategoryDto[]>();

    for (const tag of tagRows) {
      const categoryRows = categoriesByBookId.get(tag.bookId) ?? [];
      categoryRows.push({
        id: tag.id,
        name: tag.name,
        type: tag.type,
        isCustom: fromSqliteBoolean(tag.isCustom),
      });
      categoriesByBookId.set(tag.bookId, categoryRows);
    }

    return bookRows.map((book) => ({
      ...book,
      categories: categoriesByBookId.get(book.id) ?? [],
      settings: settingsByBookId.get(book.id),
    }));
  }

  private async findById(id: string): Promise<BookDto | undefined> {
    const book = await db.selectFrom('books').selectAll().where('id', '=', id).executeTakeFirst();
    if (!book) {
      return undefined;
    }
    const [withRelations] = await this.loadRelations([book]);
    return this.mapToDto(withRelations);
  }

  private createSettingsRow(bookId: string, data: CreateBookDto): NewBookSettingsRow {
    return {
      bookSettingId: bookId,
      language: data.settings?.language || data.language || 'english',
      proseTense: data.settings?.proseTense || 'past',
      pointOfView: data.settings?.pointOfView || 'third_limited',
      synopsisAiContext: toSqliteBoolean(data.settings?.synopsisAiContext ?? true),
      povCharacterId: data.settings?.povCharacterId || null,
      embeddingModel: data.settings?.embeddingModel ?? null,
      localEmbeddingModel: data.settings?.localEmbeddingModel ?? null,
      openrouterEmbeddingModel: data.settings?.openRouterEmbeddingModel ?? null,
      vectorSearchEnabled: toSqliteBoolean(data.settings?.vectorSearchEnabled ?? true),
      automaticIndexingEnabled: toSqliteBoolean(
        data.settings?.automaticIndexingEnabled ?? false,
      ),
    };
  }

  private createSettingsUpdate(settings: BookSettingsDto): BookSettingsUpdate {
    const update: BookSettingsUpdate = {};
    if (settings.language !== undefined) update.language = settings.language;
    if (settings.proseTense !== undefined) update.proseTense = settings.proseTense;
    if (settings.pointOfView !== undefined) update.pointOfView = settings.pointOfView;
    if (settings.synopsisAiContext !== undefined) {
      update.synopsisAiContext = toSqliteBoolean(settings.synopsisAiContext);
    }
    if (settings.povCharacterId !== undefined) update.povCharacterId = settings.povCharacterId;
    if (settings.embeddingModel !== undefined) update.embeddingModel = settings.embeddingModel;
    if (settings.localEmbeddingModel !== undefined) {
      update.localEmbeddingModel = settings.localEmbeddingModel;
    }
    if (settings.openRouterEmbeddingModel !== undefined) {
      update.openrouterEmbeddingModel = settings.openRouterEmbeddingModel;
    }
    if (settings.vectorSearchEnabled !== undefined) {
      update.vectorSearchEnabled = toSqliteBoolean(settings.vectorSearchEnabled);
    }
    if (settings.automaticIndexingEnabled !== undefined) {
      update.automaticIndexingEnabled = toSqliteBoolean(settings.automaticIndexingEnabled);
    }
    return update;
  }

  private async saveBookCategories(bookId: string, categoriesToSave?: CategoryDto[]): Promise<void> {
    if (!categoriesToSave || categoriesToSave.length === 0) {
      return;
    }

    for (const categoryToSave of categoriesToSave) {
      const category = await db
        .insertInto('categories')
        .values({
          id: categoryToSave.id || randomUUID(),
          name: categoryToSave.name,
          type: categoryToSave.type,
          isCustom: toSqliteBoolean(categoryToSave.isCustom),
        })
        .onConflict((conflict) =>
          conflict.columns(['name', 'type']).doUpdateSet({
            isCustom: toSqliteBoolean(categoryToSave.isCustom),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();

      await db
        .insertInto('bookTags')
        .values({ bookId, categoryId: category.id })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    }
  }

  async getAll(): Promise<BookDto[]> {
    const books = await this.loadRelations(await db.selectFrom('books').selectAll().execute());
    return books.map((book) => this.mapToDto(book));
  }

  async getById(id: string): Promise<BookDto | undefined> {
    return this.findById(id);
  }

  async add(data: CreateBookDto): Promise<BookDto> {
    const { categories, settings, ...bookData } = data;
    const timestamp = toSqliteTimestamp();
    const id = randomUUID();

    await db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto('books')
        .values({
          id,
          title: bookData.title,
          author: bookData.author,
          status: bookData.status,
          synopsis: bookData.synopsis ?? null,
          language: bookData.language,
          coverImage: this.dataUrlToBuffer(bookData.coverImage),
          wordCount: bookData.wordCount ?? 0,
          createdAt: timestamp,
          lastEditedAt: timestamp,
        })
        .execute();
      await transaction
        .insertInto('bookSettings')
        .values(this.createSettingsRow(id, { ...data, settings }))
        .execute();
    });

    await this.saveBookCategories(id, categories);
    const result = await this.findById(id);
    if (!result) {
      throw new Error('Failed to retrieve new book');
    }
    return result;
  }

  async update(id: string, data: UpdateBookDto): Promise<BookDto | undefined> {
    const { categories, settings, ...bookData } = data;
    const update: Record<string, unknown> = { ...bookData, lastEditedAt: toSqliteTimestamp() };
    if (bookData.coverImage !== undefined) {
      update['coverImage'] = this.dataUrlToBuffer(bookData.coverImage);
    }

    await db.updateTable('books').set(update).where('id', '=', id).execute();
    if (settings) {
      const settingsUpdate = this.createSettingsUpdate(settings);
      if (Object.keys(settingsUpdate).length > 0) {
        await db
          .updateTable('bookSettings')
          .set(settingsUpdate)
          .where('bookSettingId', '=', id)
          .execute();
      }
    }
    if (categories) {
      await db.deleteFrom('bookTags').where('bookId', '=', id).execute();
      await this.saveBookCategories(id, categories);
    }
    return this.findById(id);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await db.deleteFrom('books').where('id', '=', id).execute();
    return { success: true };
  }

  async getLanguages(): Promise<{ languageName: string }[]> {
    return db.selectFrom('language').selectAll().execute();
  }

  private async getCategoryCatalog(type: CategoryDto['type']) {
    const categories = await db.selectFrom('categories').selectAll().where('type', '=', type).execute();
    if (categories.length === 0) {
      return [];
    }
    const categoryIds = categories.map(({ id }) => id);
    const subcategories = await db
      .selectFrom('subcategories')
      .selectAll()
      .where('parentCategoryId', 'in', categoryIds)
      .execute();
    const childrenByParent = new Map<string, typeof subcategories>();
    for (const child of subcategories) {
      const children = childrenByParent.get(child.parentCategoryId) ?? [];
      children.push(child);
      childrenByParent.set(child.parentCategoryId, children);
    }
    return categories.map((category) => ({
      ...category,
      isCustom: fromSqliteBoolean(category.isCustom),
      subcategories: (childrenByParent.get(category.id) ?? []).map((child) => ({
        ...child,
        isCustom: fromSqliteBoolean(child.isCustom),
      })),
    }));
  }

  async getGenres() {
    return this.getCategoryCatalog('genre');
  }

  async getTropes() {
    return this.getCategoryCatalog('trope');
  }

  async getEmbeddingModel(bookId: string): Promise<EmbeddingModel | null> {
    const row = await db.selectFrom('bookSettings').select('embeddingModel').where('bookSettingId', '=', bookId).executeTakeFirst();
    return row?.embeddingModel ?? null;
  }

  async getLocalEmbeddingModel(bookId: string): Promise<LocalEmbeddingModelName | null> {
    const row = await db.selectFrom('bookSettings').select('localEmbeddingModel').where('bookSettingId', '=', bookId).executeTakeFirst();
    return row?.localEmbeddingModel ?? null;
  }

  async getOpenRouterEmbeddingModel(bookId: string): Promise<OpenRouterEmbeddingModelName | null> {
    const row = await db.selectFrom('bookSettings').select('openrouterEmbeddingModel').where('bookSettingId', '=', bookId).executeTakeFirst();
    return row?.openrouterEmbeddingModel ?? null;
  }

  async getVectorSearchEnabled(bookId: string): Promise<boolean> {
    const row = await db.selectFrom('bookSettings').select('vectorSearchEnabled').where('bookSettingId', '=', bookId).executeTakeFirst();
    return row ? fromSqliteBoolean(row.vectorSearchEnabled) : true;
  }

  async getAutomaticIndexingEnabled(bookId: string): Promise<boolean> {
    const row = await db.selectFrom('bookSettings').select('automaticIndexingEnabled').where('bookSettingId', '=', bookId).executeTakeFirst();
    return row ? fromSqliteBoolean(row.automaticIndexingEnabled) : false;
  }

  private async updateEmbeddingSettings(
    bookId: string,
    update: BookSettingsUpdate,
  ): Promise<void> {
    const result = await db
      .updateTable('bookSettings')
      .set(update)
      .where('bookSettingId', '=', bookId)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new Error(`Book not found: ${bookId}`);
    }
  }

  async selectLocalEmbeddingModel(bookId: string, modelName: LocalEmbeddingModelName): Promise<void> {
    await this.updateEmbeddingSettings(bookId, { embeddingModel: 'local', localEmbeddingModel: modelName });
  }

  async selectOpenRouterEmbeddingModel(bookId: string, modelName: OpenRouterEmbeddingModelName): Promise<void> {
    await this.updateEmbeddingSettings(bookId, { embeddingModel: 'openRouter', openrouterEmbeddingModel: modelName });
  }

  async selectCloudEmbeddingProvider(bookId: string, providerId: VectorCloudProviderId): Promise<void> {
    await this.updateEmbeddingSettings(bookId, {
      embeddingModel: providerId === 'openai' ? 'openAI' : 'voyage',
    });
  }

  async setEmbeddingSelection(bookId: string, selection: ResolvedBookEmbeddingSelection): Promise<void> {
    const update = {
      embeddingModel: selection.embeddingModel,
      localEmbeddingModel: selection.localEmbeddingModel,
      openrouterEmbeddingModel: selection.openRouterEmbeddingModel,
    };
    const result = await db.updateTable('bookSettings').set(update).where('bookSettingId', '=', bookId).executeTakeFirst();
    if (result.numUpdatedRows > 0n) {
      return;
    }
    const book = await db.selectFrom('books').select('language').where('id', '=', bookId).executeTakeFirst();
    if (!book) {
      throw new Error(`Book not found: ${bookId}`);
    }
    await db.insertInto('bookSettings').values({
      bookSettingId: bookId,
      language: book.language,
      proseTense: 'past',
      pointOfView: 'third_limited',
      synopsisAiContext: 1,
      povCharacterId: null,
      vectorSearchEnabled: 1,
      automaticIndexingEnabled: 0,
      ...update,
    }).execute();
  }

  async countBooksUsingLocalEmbeddingModel(modelName: LocalEmbeddingModelName): Promise<number> {
    const result = await db
      .selectFrom('bookSettings')
      .select(sql<number>`count(*)`.as('value'))
      .where('embeddingModel', '=', 'local')
      .where('localEmbeddingModel', '=', modelName)
      .executeTakeFirstOrThrow();
    return Number(result.value);
  }
}

export const bookRepository = new BookRepository();
