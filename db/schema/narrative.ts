import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

import type { TiptapJsonDoc } from '../../shared/models/manuscript.model';
import { books } from './book';

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

type PointOfView = 'first' | 'second' | 'third_limited' | 'third_omni';

// ---------------------------------------------------------------------------
// Narrative tables
// ---------------------------------------------------------------------------

export const act = sqliteTable('acts', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  summary: text('summary'),
});

export const chapter = sqliteTable('chapters', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  actId: text('act_id')
    .notNull()
    .references(() => act.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  summary: text('summary'),
});

export const scene = sqliteTable('scenes', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  chapterId: text('chapter_id')
    .notNull()
    .references(() => chapter.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  prose: text('prose', { mode: 'json' }).$type<TiptapJsonDoc | null>(),
  summary: text('summary'),
  wordCount: integer('word_count').default(0),

  // Scene-level AI generation overrides; null means "use the book settings".
  pointOfViewOverride: text('point_of_view_override').$type<PointOfView>(),
  povCharacterIdOverride: text('pov_character_id_override'),
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export const booksNarrativeRelations = relations(books, ({ many }) => ({
  acts: many(act),
}));

export const actRelations = relations(act, ({ one, many }) => ({
  book: one(books, {
    fields: [act.bookId],
    references: [books.id],
  }),
  chapters: many(chapter),
}));

export const chapterRelations = relations(chapter, ({ one, many }) => ({
  act: one(act, {
    fields: [chapter.actId],
    references: [act.id],
  }),
  scenes: many(scene),
}));

export const sceneRelations = relations(scene, ({ one }) => ({
  chapter: one(chapter, {
    fields: [scene.chapterId],
    references: [chapter.id],
  }),
}));
