import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('app_settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});