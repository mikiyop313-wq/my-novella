import { sqliteTable, text, integer, blob, primaryKey, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

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
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
    unq: unique().on(t.name, t.type),
}));

export const bookTags = sqliteTable('book_tags', {
    bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
},
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.categoryId] }),
    }));

export const booksRelations = relations(books, ({ many }) => ({
    bookTags: many(bookTags),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    bookTags: many(bookTags),
}));

export const bookTagsRelations = relations(bookTags, ({ one }) => ({
    book: one(books, {
        fields: [bookTags.bookId],
        references: [books.id],
    }),
    category: one(categories, {
        fields: [bookTags.categoryId],
        references: [categories.id],
    }),
}));