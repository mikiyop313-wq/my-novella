import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { blob, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

type BookStatus = 'archived' | 'draft';
type CategoryType = 'genre' | 'trope' | 'demographic';
type ProseTense = 'past' | 'present';
type PointOfView = 'first' | 'second' | 'third_limited' | 'third_omni';
type EmbeddingModel = 'local' | 'openAI' | 'voyage';

// ---------------------------------------------------------------------------
// Core book tables
// ---------------------------------------------------------------------------

export const books = sqliteTable('books', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  author: text('author').notNull(),
  status: text('status').$type<BookStatus>().notNull().default('draft'),
  synopsis: text('synopsis'),
  language: text('language')
    .notNull()
    .default('english')
    .references(() => language.languageName),
  coverImage: blob('cover_image'),
  wordCount: integer('word_count').$defaultFn(() => 0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const language = sqliteTable('language', {
  languageName: text('language_name').notNull().primaryKey(),
});

export const bookSettings = sqliteTable('book_settings', {
  bookSettingId: text('book_setting_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' })
    .primaryKey(),
  language: text('language')
    .notNull()
    .default('english')
    .references(() => language.languageName),
  proseTense: text('prose_tense').$type<ProseTense>().notNull().default('past'),
  pointOfView: text('point_of_view').$type<PointOfView>().notNull().default('third_limited'),
  synopsisAiContext: integer('synopsis_ai_context', { mode: 'boolean' }).notNull().default(true),
  povCharacterId: text('pov_character_id'),
  embeddingModel: text('embedding_model').$type<EmbeddingModel>().notNull().default('local'),
});

// ---------------------------------------------------------------------------
// Category tables
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    name: text('name').notNull(),
    type: text('type').$type<CategoryType>().notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [unique().on(t.name, t.type)],
);

export const subcategories = sqliteTable(
  'subcategories',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    name: text('name').notNull(),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    parentCategoryId: text('parent_category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.name, t.parentCategoryId)],
);

export const bookTags = sqliteTable(
  'book_tags',
  {
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.categoryId] })],
);

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

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
