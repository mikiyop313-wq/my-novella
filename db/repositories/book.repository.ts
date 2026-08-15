import { db } from '../index';
import { books, categories, bookTags, language } from '../schema';
import { eq } from 'drizzle-orm';
import { BookDto, CreateBookDto, UpdateBookDto } from '../../shared/models/book.model';

type BookEntity = typeof books.$inferSelect;

export class BookRepository {
    private mapToDto(book: any): BookDto {
        const { bookTags, createdAt, lastEditedAt, ...rest } = book;
        const categories = bookTags?.map((bt: any) => bt.category) || [];

        // If coverImage is a Buffer, convert it to a Uint8Array for IPC
        let coverImage = rest.coverImage;
        if (coverImage && Buffer.isBuffer(coverImage)) {
            coverImage = new Uint8Array(coverImage);
        }

        const dto: BookDto = {
            ...rest,
            coverImage,
            createdAt: createdAt.toISOString(),
            lastEditedAt: lastEditedAt.toISOString(),
            categories
        };

        return dto;
    }

    private dataUrlToBuffer(dataUrl: string | Uint8Array | null): Buffer | null {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            return dataUrl as any;
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
                }
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
                }
            }
        });
        return book ? this.mapToDto(book) : undefined;
    }

    async add(data: CreateBookDto): Promise<BookDto> {
        const { categories: categoriesToSave, ...bookData } = data;

        // Convert coverImage to Buffer if it's a Data URL
        if (bookData.coverImage) {
            bookData.coverImage = this.dataUrlToBuffer(bookData.coverImage as any) as any;
        }

        const [newBook] = await db.insert(books).values(bookData as any).returning();

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
        const { categories: categoriesToSave, ...updateData } = data;

        // Convert coverImage to Buffer if it's a Data URL
        if (updateData.coverImage) {
            updateData.coverImage = this.dataUrlToBuffer(updateData.coverImage as any) as any;
        }

        await db.update(books)
            .set({ ...updateData as any, lastEditedAt: new Date() })
            .where(eq(books.id, id));

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
}

export const bookRepository = new BookRepository();
