import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------

// Simple key/value storage for app-wide preferences that do not belong to a
// specific book.
export const settings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
