import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

import type { TiptapJsonDoc } from '../../shared/models/manuscript.model';
import { books } from './book';

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

type PointOfView = 'first' | 'second' | 'third_limited' | 'third_omni';
type NarrativeStatus = 'active' | 'archived';

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
  status: text('status').$type<NarrativeStatus>().notNull().default('active'),
  summary: text('summary'),
});

// Parent IDs are nullable so archived children can survive parent deletion.
// Active-parent invariants are enforced by repository write methods.
export const chapter = sqliteTable('chapters', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  actId: text('act_id')
    .references(() => act.id, { onDelete: 'set null' }),
  position: integer('position').notNull(),
  status: text('status').$type<NarrativeStatus>().notNull().default('active'),
  archiveParentTitle: text('archive_parent_title'),
  summary: text('summary'),
});

// Parent IDs are nullable so archived children can survive parent deletion.
// Active-parent invariants are enforced by repository write methods.
export const scene = sqliteTable('scenes', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  title: text('title').notNull(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id')
    .references(() => chapter.id, { onDelete: 'set null' }),
  position: integer('position').notNull(),
  status: text('status').$type<NarrativeStatus>().notNull().default('active'),
  archiveParentTitle: text('archive_parent_title'),
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
  chapters: many(chapter),
  scenes: many(scene),
}));

export const actRelations = relations(act, ({ one, many }) => ({
  book: one(books, {
    fields: [act.bookId],
    references: [books.id],
  }),
  chapters: many(chapter),
}));

export const chapterRelations = relations(chapter, ({ one, many }) => ({
  book: one(books, {
    fields: [chapter.bookId],
    references: [books.id],
  }),
  act: one(act, {
    fields: [chapter.actId],
    references: [act.id],
  }),
  scenes: many(scene),
}));

export const sceneRelations = relations(scene, ({ one }) => ({
  book: one(books, {
    fields: [scene.bookId],
    references: [books.id],
  }),
  chapter: one(chapter, {
    fields: [scene.chapterId],
    references: [chapter.id],
  }),
}));
