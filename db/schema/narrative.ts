import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { books } from './book';

// ==========================================
// TABLE DEFINITIONS
// ==========================================

export const act = sqliteTable('acts', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    bookId: text('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // Order of the act in the book
    summary: text('summary'),
});

export const chapter = sqliteTable('chapters', { // Fixed table name collision
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    actId: text('act_id').notNull().references(() => act.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // Order of the chapter in the act
    summary: text('summary'),
});

export const scene = sqliteTable('scenes', { // Fixed table name collision
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    chapterId: text('chapter_id').notNull().references(() => chapter.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(), // Order of the scene in the chapter
    prose: text('prose', { mode: 'json' }).$type<Record<string, any> | null>(),
    summary: text('summary'),
    wordCount: integer('word_count').default(0),

    // Scene-specific Point of View overrides for AI generation
    pointOfViewOverride: text('point_of_view_override').$type<'first' | 'second' | 'third_limited' | 'third_omni'>(),
    povCharacterIdOverride: text('pov_character_id_override'), // references character codex when implemented
});

// ==========================================
// RELATIONSHIPS
// ==========================================

// Book relations updated to map acts
export const booksNarrativeRelations = relations(books, ({ many }) => ({
    acts: many(act),
}));

// Act relations linking back to book and forward to chapters
export const actRelations = relations(act, ({ one, many }) => ({
    book: one(books, {
        fields: [act.bookId],
        references: [books.id],
    }),
    chapters: many(chapter),
}));

// Chapter relations linking back to act and forward to scenes
export const chapterRelations = relations(chapter, ({ one, many }) => ({
    act: one(act, {
        fields: [chapter.actId],
        references: [act.id],
    }),
    scenes: many(scene),
}));

// Scene relations linking back to chapter
export const sceneRelations = relations(scene, ({ one }) => ({
    chapter: one(chapter, {
        fields: [scene.chapterId],
        references: [chapter.id],
    }),
}));