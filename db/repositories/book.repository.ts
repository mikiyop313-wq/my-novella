import { db } from '../index';
import { books } from '../schema';
import { eq } from 'drizzle-orm';
import { BookDto, CreateBookDto, UpdateBookDto } from '../../shared/models/book.model';

type BookEntity = typeof books.$inferSelect;

export class BookRepository {
    private mapToDto(book: BookEntity): BookDto {
        return {
            ...book,
            createdAt: book.createdAt.toISOString(),
            lastEditedAt: book.lastEditedAt.toISOString(),
        };
    }

    async getAll(): Promise<BookDto[]> {
        const results = await db.select().from(books);
        return results.map(book => this.mapToDto(book));
    }

    async add(data: CreateBookDto): Promise<BookDto> {
        const [newBook] = await db.insert(books).values(data).returning();
        return this.mapToDto(newBook);
    }

    async update(id: string, data: UpdateBookDto): Promise<BookDto | undefined> {
        const [updatedBook] = await db.update(books)
            .set({ ...data, lastEditedAt: new Date() })
            .where(eq(books.id, id))
            .returning();
        
        return updatedBook ? this.mapToDto(updatedBook) : undefined;
    }

    async delete(id: string): Promise<{ success: boolean }> {
        await db.delete(books).where(eq(books.id, id));
        return { success: true };
    }
}

export const bookRepository = new BookRepository();
