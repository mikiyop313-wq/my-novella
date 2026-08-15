import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  CodexEntryStatus,
  CodexEntryType,
  CodexTrackingSetting,
} from '../../shared/models/codex.model';
import { books } from './book';
import { scene } from './narrative';

export const codexEntries = sqliteTable(
  'codex_entries',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    type: text('type').$type<CodexEntryType>().notNull().default('character'),
    name: text('name').notNull(),
    alias: text('alias'),
    description: text('description'),
    image: blob('image'),
    status: text('status').$type<CodexEntryStatus>().notNull().default('active'),
    trackingSetting: text('tracking_setting')
      .$type<CodexTrackingSetting>()
      .notNull()
      .default('include_when_detected'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('codex_entries_book_type_idx').on(t.bookId, t.type),
    index('codex_entries_book_name_idx').on(t.bookId, t.name),
  ],
);

export const codexEntryNotes = sqliteTable(
  'codex_entry_notes',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    codexEntryId: text('codex_entry_id')
      .notNull()
      .references(() => codexEntries.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [index('codex_entry_notes_entry_idx').on(t.codexEntryId)],
);

export const codexEntryProgression = sqliteTable(
  'codex_entry_progression',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    codexEntryId: text('codex_entry_id')
      .notNull()
      .references(() => codexEntries.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    description: text('description').notNull().default(''),
    sceneId: text('scene_id').references(() => scene.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('codex_entry_progression_entry_idx').on(t.codexEntryId),
    index('codex_entry_progression_scene_idx').on(t.sceneId),
  ],
);

export const codexEntriesRelations = relations(codexEntries, ({ one, many }) => ({
  book: one(books, {
    fields: [codexEntries.bookId],
    references: [books.id],
  }),
  entryNotes: many(codexEntryNotes),
  entryProgression: many(codexEntryProgression),
}));

export const codexEntryNotesRelations = relations(codexEntryNotes, ({ one }) => ({
  entry: one(codexEntries, {
    fields: [codexEntryNotes.codexEntryId],
    references: [codexEntries.id],
  }),
}));

export const codexEntryProgressionRelations = relations(codexEntryProgression, ({ one }) => ({
  entry: one(codexEntries, {
    fields: [codexEntryProgression.codexEntryId],
    references: [codexEntries.id],
  }),
  scene: one(scene, {
    fields: [codexEntryProgression.sceneId],
    references: [scene.id],
  }),
}));
