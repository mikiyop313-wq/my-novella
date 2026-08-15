import { db } from '../index';
import { books, categories, bookTags, language, subcategories, bookSettings } from '../schema';
import { and, count, eq } from 'drizzle-orm';

import {
  BookDto,
  BookSettingsDto,
  CategoryDto,
  CreateBookDto,
  UpdateBookDto,
} from '../../shared/models/book.model';
import {
  EmbeddingModel,
  LocalEmbeddingModelName,
} from '../../shared/models/vector.model';

type BookEntity = typeof books.$inferSelect;
type BookSettingsEntity = typeof bookSettings.$inferSelect;
type BookSettingsInsert = typeof bookSettings.$inferInsert;
type BookSettingsUpdate = Partial<Omit<BookSettingsInsert, 'bookSettingId'>>;
type CoverImageInput = BookDto['coverImage'] | undefined;
type BookWithRelations = BookEntity & {
  bookTags?: Array<{ category: CategoryDto }>;
  bookSettings?: BookSettingsEntity | null;
};

export class BookRepository {
  // -----------------------------------------------------------------------
  // Mapping helpers
  // -----------------------------------------------------------------------

  private mapToDto(book: BookWithRelations): BookDto {
    const bookCategories = book.bookTags?.map((tag) => tag.category) ?? [];
    const coverImage = this.mapCoverImageForIpc(book.coverImage);

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      status: book.status,
      synopsis: book.synopsis,
      language: book.language,
      coverImage,
      wordCount: book.wordCount ?? 0,
      createdAt: book.createdAt!.toISOString(),
      lastEditedAt: book.lastEditedAt!.toISOString(),
      categories: bookCategories,
      ...(book.bookSettings ? { settings: this.mapSettingsToDto(book.bookSettings) } : {}),
    };
  }

  private mapCoverImageForIpc(coverImage: BookEntity['coverImage']): BookDto['coverImage'] {
    // Buffers do not cross Electron IPC as nicely as plain Uint8Array.
    if (coverImage && Buffer.isBuffer(coverImage)) {
      return new Uint8Array(coverImage);
    }

    return coverImage as BookDto['coverImage'];
  }

  private mapSettingsToDto(settings: BookSettingsEntity): BookSettingsDto {
    return {
      language: settings.language,
      proseTense: settings.proseTense,
      pointOfView: settings.pointOfView,
      synopsisAiContext: settings.synopsisAiContext,
      povCharacterId: settings.povCharacterId,
      embeddingModel: settings.embeddingModel,
      localEmbeddingModel: settings.localEmbeddingModel,
      vectorSearchEnabled: settings.vectorSearchEnabled,
    };
  }

  private dataUrlToBuffer(dataUrl: CoverImageInput): Buffer | CoverImageInput {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return dataUrl;
    }

    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  private async findById(id: string): Promise<BookDto | undefined> {
    const book = await db.query.books.findFirst({
      where: eq(books.id, id),
      with: {
        bookTags: {
          with: {
            category: true,
          },
        },
        bookSettings: true,
      },
    });

    return book ? this.mapToDto(book) : undefined;
  }

  private createSettingsRow(bookId: string, data: CreateBookDto): BookSettingsInsert {
    return {
      bookSettingId: bookId,
      language: data.settings?.language || data.language || 'english',
      proseTense: data.settings?.proseTense || 'past',
      pointOfView: data.settings?.pointOfView || 'third_limited',
      synopsisAiContext: data.settings?.synopsisAiContext ?? true,
      povCharacterId: data.settings?.povCharacterId || null,
      embeddingModel: data.settings?.embeddingModel || 'local',
      localEmbeddingModel:
        data.settings?.localEmbeddingModel || 'mixedbread-ai/mxbai-embed-large-v1',
      vectorSearchEnabled: data.settings?.vectorSearchEnabled ?? true,
    };
  }

  private createSettingsUpdate(settings: BookSettingsDto): BookSettingsUpdate {
    const updatePayload: BookSettingsUpdate = {};

    if (settings.language !== undefined) updatePayload.language = settings.language;
    if (settings.proseTense !== undefined) updatePayload.proseTense = settings.proseTense;
    if (settings.pointOfView !== undefined) updatePayload.pointOfView = settings.pointOfView;
    if (settings.synopsisAiContext !== undefined)
      updatePayload.synopsisAiContext = settings.synopsisAiContext;
    if (settings.povCharacterId !== undefined)
      updatePayload.povCharacterId = settings.povCharacterId;
    if (settings.embeddingModel !== undefined)
      updatePayload.embeddingModel = settings.embeddingModel;
    if (settings.localEmbeddingModel !== undefined)
      updatePayload.localEmbeddingModel = settings.localEmbeddingModel;
    if (settings.vectorSearchEnabled !== undefined)
      updatePayload.vectorSearchEnabled = settings.vectorSearchEnabled;

    return updatePayload;
  }

  private async saveBookCategories(
    bookId: string,
    categoriesToSave?: CategoryDto[],
  ): Promise<void> {
    if (!categoriesToSave || categoriesToSave.length === 0) {
      return;
    }

    for (const categoryToSave of categoriesToSave) {
      const [category] = await db
        .insert(categories)
        .values({
          name: categoryToSave.name,
          type: categoryToSave.type,
          isCustom: categoryToSave.isCustom,
        })
        .onConflictDoUpdate({
          target: [categories.name, categories.type],
          set: { isCustom: categoryToSave.isCustom },
        })
        .returning();

      await db
        .insert(bookTags)
        .values({
          bookId,
          categoryId: category.id,
        })
        .onConflictDoNothing();
    }
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  async getAll(): Promise<BookDto[]> {
    const results = await db.query.books.findMany({
      with: {
        bookTags: {
          with: {
            category: true,
          },
        },
        bookSettings: true,
      },
    });
    return results.map((book) => this.mapToDto(book));
  }

  async getById(id: string): Promise<BookDto | undefined> {
    return this.findById(id);
  }

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async add(data: CreateBookDto): Promise<BookDto> {
    const { categories: categoriesToSave, settings, ...bookData } = data;

    if (bookData.coverImage) {
      bookData.coverImage = this.dataUrlToBuffer(bookData.coverImage) as unknown as string;
    }

    const [newBook] = await db
      .insert(books)
      .values(bookData as BookEntity)
      .returning();

    await db.insert(bookSettings).values(this.createSettingsRow(newBook.id, { ...data, settings }));

    await this.saveBookCategories(newBook.id, categoriesToSave);

    const result = await this.findById(newBook.id);

    if (!result) {
      throw new Error('Failed to retrieve new book');
    }

    return result;
  }

  async update(id: string, data: UpdateBookDto): Promise<BookDto | undefined> {
    const { categories: categoriesToSave, settings, ...updateData } = data;

    if (updateData.coverImage) {
      updateData.coverImage = this.dataUrlToBuffer(updateData.coverImage) as unknown as string;
    }

    await db
      .update(books)
      .set({ ...(updateData as Partial<BookEntity>), lastEditedAt: new Date() })
      .where(eq(books.id, id));

    if (settings) {
      const updatePayload = this.createSettingsUpdate(settings);

      if (Object.keys(updatePayload).length > 0) {
        await db.update(bookSettings).set(updatePayload).where(eq(bookSettings.bookSettingId, id));
      }
    }

    if (categoriesToSave) {
      await db.delete(bookTags).where(eq(bookTags.bookId, id));
      await this.saveBookCategories(id, categoriesToSave);
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(books).where(eq(books.id, id));
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Lookup lists
  // -----------------------------------------------------------------------

  async getLanguages(): Promise<{ languageName: string }[]> {
    return await db.select().from(language);
  }

  async getGenres() {
    return await db.query.categories.findMany({
      where: eq(categories.type, 'genre'),
      with: {
        subcategories: true,
      },
    });
  }

  async getTropes() {
    return await db.query.categories.findMany({
      where: eq(categories.type, 'trope'),
      with: {
        subcategories: true,
      },
    });
  }

  async getEmbeddingModel(bookId: string): Promise<EmbeddingModel> {
    const settings = await db.query.bookSettings.findFirst({
      where: eq(bookSettings.bookSettingId, bookId),
      columns: { embeddingModel: true },
    });
    return settings?.embeddingModel ?? 'local';
  }

  async getLocalEmbeddingModel(bookId: string): Promise<LocalEmbeddingModelName> {
    const settings = await db.query.bookSettings.findFirst({
      where: eq(bookSettings.bookSettingId, bookId),
      columns: { localEmbeddingModel: true },
    });
    return settings?.localEmbeddingModel ?? 'mixedbread-ai/mxbai-embed-large-v1';
  }

  async selectLocalEmbeddingModel(
    bookId: string,
    modelName: LocalEmbeddingModelName,
  ): Promise<void> {
    const updated = await db
      .update(bookSettings)
      .set({ embeddingModel: 'local', localEmbeddingModel: modelName })
      .where(eq(bookSettings.bookSettingId, bookId))
      .returning({ bookId: bookSettings.bookSettingId });
    if (updated.length === 0) throw new Error(`Book not found: ${bookId}`);
  }

  async countBooksUsingLocalEmbeddingModel(
    modelName: LocalEmbeddingModelName,
  ): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(bookSettings)
      .where(and(
        eq(bookSettings.embeddingModel, 'local'),
        eq(bookSettings.localEmbeddingModel, modelName),
      ));
    return result?.value ?? 0;
  }
}

export const bookRepository = new BookRepository();
