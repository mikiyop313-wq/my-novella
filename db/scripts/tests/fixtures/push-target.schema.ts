import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const parents = sqliteTable('parents', {
  id: text('id').primaryKey(),
});

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    parentId: text('parent_id').references(() => parents.id),
    optionalNote: text('optional_note'),
    status: text('status').notNull().default('draft'),
  },
  (table) => [
    index('entries_title_idx').on(table.title),
    index('entries_parent_idx').on(table.parentId),
  ],
);

export const freshRecords = sqliteTable('fresh_records', {
  id: text('id').primaryKey(),
});
