import { db } from '../index';
import { books, categories, bookTags, language, subcategories, bookSettings } from '../schema';
import { eq } from 'drizzle-orm';
import { BookDto, CreateBookDto, UpdateBookDto, CategoryDto } from '../../shared/models/book.model';

type BookEntity = typeof books.$inferSelect;

export class BookRepository {
    private mapToDto(book: BookEntity & { bookTags?: { category: CategoryDto }[], bookSettings?: any }): BookDto {
        const { bookTags, bookSettings: bs, createdAt, lastEditedAt, ...rest } = book;
        const categories = bookTags?.map(bt => bt.category) || [];

        // If coverImage is a Buffer, convert it to a Uint8Array for IPC
        let coverImage = rest.coverImage;
        if (coverImage && Buffer.isBuffer(coverImage)) {
            coverImage = new Uint8Array(coverImage);
        }

        const dto: BookDto = {
            ...rest,
            coverImage: coverImage as Uint8Array,
            createdAt: createdAt.toISOString(),
            lastEditedAt: lastEditedAt.toISOString(),
            categories,
            ...(bs ? {
                settings: {
                    language: bs.language,
                    proseTense: bs.proseTense,
                    pointOfView: bs.pointOfView,
                    synopsisAiContext: bs.synopsisAiContext,
                    povCharacterId: bs.povCharacterId
                }
            } : {})
        };

        return dto;
    }

    private dataUrlToBuffer(dataUrl: string | Uint8Array | null): Buffer | null {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            return dataUrl as unknown as Buffer;
        }
        const base64 = dataUrl.split(',')[1];
        return Buffer.from(base64, 'base64');
    }

    async getAll(): Promise<BookDto[]> {
        const results = await db.query.books.findMany({
            with: {
                bookTags: {
                    with: {
                        category: true
                    }
                },
                bookSettings: true
            }
        });
        return results.map(book => this.mapToDto(book));
    }

    async getById(id: string): Promise<BookDto | undefined> {
        const book = await db.query.books.findFirst({
            where: eq(books.id, id),
            with: {
                bookTags: {
                    with: {
                        category: true
                    }
                },
                bookSettings: true
            }
        });
        return book ? this.mapToDto(book) : undefined;
    }

    async add(data: CreateBookDto): Promise<BookDto> {
        const { categories: categoriesToSave, settings, ...bookData } = data;

        // Convert coverImage to Buffer if it's a Data URL
        if (bookData.coverImage) {
            bookData.coverImage = this.dataUrlToBuffer(bookData.coverImage) as unknown as string;
        }

        const [newBook] = await db.insert(books).values(bookData as BookEntity).returning();

        await db.insert(bookSettings).values({
            bookSettingId: newBook.id,
            language: settings?.language || bookData.language || 'english',
            proseTense: settings?.proseTense || 'past',
            pointOfView: settings?.pointOfView || 'third_limited',
            synopsisAiContext: settings?.synopsisAiContext ?? true,
            povCharacterId: settings?.povCharacterId || null
        });

        if (categoriesToSave && categoriesToSave.length > 0) {
            for (const cat of categoriesToSave) {
                const [category] = await db.insert(categories)
                    .values({ name: cat.name, type: cat.type, isCustom: cat.isCustom })
                    .onConflictDoUpdate({
                        target: [categories.name, categories.type],
                        set: { isCustom: cat.isCustom }
                    })
                    .returning();

                await db.insert(bookTags).values({
                    bookId: newBook.id,
                    categoryId: category.id
                }).onConflictDoNothing();
            }
        }

        const result = await this.getById(newBook.id);
        if (!result) throw new Error('Failed to retrieve new book');
        return result;
    }

    async update(id: string, data: UpdateBookDto): Promise<BookDto | undefined> {
        const { categories: categoriesToSave, settings, ...updateData } = data;

        // Convert coverImage to Buffer if it's a Data URL
        if (updateData.coverImage) {
            updateData.coverImage = this.dataUrlToBuffer(updateData.coverImage) as unknown as string;
        }

        await db.update(books)
            .set({ ...updateData as Partial<BookEntity>, lastEditedAt: new Date() })
            .where(eq(books.id, id));

        if (settings) {
            const updatePayload: any = {};
            if (settings.language !== undefined) updatePayload.language = settings.language;
            if (settings.proseTense !== undefined) updatePayload.proseTense = settings.proseTense;
            if (settings.pointOfView !== undefined) updatePayload.pointOfView = settings.pointOfView;
            if (settings.synopsisAiContext !== undefined) updatePayload.synopsisAiContext = settings.synopsisAiContext;
            if (settings.povCharacterId !== undefined) updatePayload.povCharacterId = settings.povCharacterId;

            if (Object.keys(updatePayload).length > 0) {
                await db.update(bookSettings)
                    .set(updatePayload)
                    .where(eq(bookSettings.bookSettingId, id));
            }
        }

        if (categoriesToSave) {
            // Delete old tags
            await db.delete(bookTags).where(eq(bookTags.bookId, id));

            // Insert new ones
            for (const cat of categoriesToSave) {
                const [category] = await db.insert(categories)
                    .values({ name: cat.name, type: cat.type, isCustom: cat.isCustom })
                    .onConflictDoUpdate({
                        target: [categories.name, categories.type],
                        set: { isCustom: cat.isCustom }
                    })
                    .returning();

                await db.insert(bookTags).values({
                    bookId: id,
                    categoryId: category.id
                }).onConflictDoNothing();
            }
        }

        return this.getById(id);
    }

    async delete(id: string): Promise<{ success: boolean }> {
        await db.delete(books).where(eq(books.id, id));
        return { success: true };
    }

    async getLanguages(): Promise<{ languageName: string }[]> {
        return await db.select().from(language);
    }

    async getGenres() {
        return await db.query.categories.findMany({
            where: eq(categories.type, 'genre'),
            with: {
                subcategories: true
            }
        });
    }

    async getTropes() {
        return await db.query.categories.findMany({
            where: eq(categories.type, 'trope'),
            with: {
                subcategories: true
            }
        });
    }
}

export const bookRepository = new BookRepository();
