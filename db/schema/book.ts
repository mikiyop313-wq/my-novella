import { sqliteTable, text, integer, blob, primaryKey, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';


export const books = sqliteTable('books', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    author: text('author').notNull(),
    status: text('status').$type<'archived' | 'draft'>().notNull().default('draft'),
    synopsis: text('synopsis'),
    language: text('language').notNull().default('english').references(() => language.languageName),
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

export const subcategories = sqliteTable('subcategories', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    parentCategoryId: text('parent_category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (t) => ({
    unq: unique().on(t.name, t.parentCategoryId),
}));

export const bookTags = sqliteTable('book_tags', {
    bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
},
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.categoryId] }),
    }));


export const language = sqliteTable('language', {
    languageName: text('language_name').notNull().primaryKey(),
});


export const bookSettings = sqliteTable('book_settings', {
    bookSettingId: text('book_setting_id').notNull().references(() => books.id, { onDelete: 'cascade' }).primaryKey(),
    language: text('language').notNull().default('english').references(() => language.languageName),
    proseTense: text('prose_tense').$type<'past' | 'present'>().notNull().default('past'),
    pointOfView: text('point_of_view').$type<'first' | 'second' | 'third_limited' | 'third_omni'>().notNull().default('third_limited'),
    synopsisAiContext: integer('synopsis_ai_context', { mode: 'boolean' }).notNull().default(true),
    povCharacterId: text('pov_character_id'),
});


//RELATIONSHIPS


export const booksRelations = relations(books, ({ many, one }) => ({
    bookTags: many(bookTags),
    bookSettings: one(bookSettings),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
    bookTags: many(bookTags),
    subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
    parentCategory: one(categories, {
        fields: [subcategories.parentCategoryId],
        references: [categories.id],
    }),
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

export const bookSettingsRelations = relations(bookSettings, ({ one }) => ({
    book: one(books, {
        fields: [bookSettings.bookSettingId],
        references: [books.id],
    }),
    language: one(language, {
        fields: [bookSettings.language],
        references: [language.languageName],
    }),
}));

export const languageRelations = relations(language, ({ many }) => ({
    bookSettingLanguage: many(bookSettings),
    books: many(books),
}));



