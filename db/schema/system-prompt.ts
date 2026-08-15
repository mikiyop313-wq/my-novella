import { randomUUID } from 'crypto';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  SystemPromptCategory,
  SystemPromptScope,
} from '../../shared/models/system-prompt.model';
import { books } from './book';

export const systemPromptPresets = sqliteTable(
  'system_prompt_presets',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    name: text('name').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    category: text('category').$type<SystemPromptCategory>().notNull(),
    scope: text('scope').$type<SystemPromptScope>().notNull(),
    bookId: text('book_id').references(() => books.id, { onDelete: 'cascade' }),
    temperature: real('temperature').notNull().default(0.5),
    topP: real('top_p').notNull().default(1),
    maxOutputTokens: integer('max_output_tokens'),
    presencePenalty: real('presence_penalty').notNull().default(0),
    frequencyPenalty: real('frequency_penalty').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('system_prompt_presets_scope_book_category_idx').on(
      table.scope,
      table.bookId,
      table.category,
    ),
  ],
);
