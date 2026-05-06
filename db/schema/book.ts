import { sqliteTable, text, integer, blob, primaryKey, unique } from 'drizzle-orm/sqlite-core';

export const books = sqliteTable('books', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    author: text('author').notNull(),
    status: text('status').$type<'archived' | 'draft'>().notNull().default('draft'),
    synopsis: text('synopsis'),
    language: text('language').notNull().default('english'),
    coverImage: blob('cover_image'),
    wordCount: integer('word_count').$defaultFn(() => 0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const categories = sqliteTable('categories', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    type: text('type').$type<'genre' | 'trope' | 'demographic'>().notNull(),
});

export const bookTags = sqliteTable('book_tags', {
    bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
},
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.categoryId] }),
    }));