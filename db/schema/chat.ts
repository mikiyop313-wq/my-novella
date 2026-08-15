import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import type {
  ChatMessageRole,
  ChatMessageStatus,
  ChatThreadStatus,
} from '../../shared/models/chat.model';
import { books } from './book';

// ---------------------------------------------------------------------------
// Chat tables
// ---------------------------------------------------------------------------

export const chatThreads = sqliteTable(
  'chat_threads',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New chat'),
    status: text('status').$type<ChatThreadStatus>().notNull().default('active'),
    lastModelId: text('last_model_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('chat_threads_book_idx').on(t.bookId),
    index('chat_threads_book_status_idx').on(t.bookId, t.status),
    index('chat_threads_book_last_edited_idx').on(t.bookId, t.lastEditedAt),
  ],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    parentMessageId: text('parent_message_id').references(
      (): AnySQLiteColumn => chatMessages.id,
      { onDelete: 'set null' },
    ),
    branchGroupId: text('branch_group_id').notNull().$defaultFn(randomUUID),
    branchOrder: integer('branch_order').notNull().default(0),
    role: text('role').$type<ChatMessageRole>().notNull(),
    content: text('content').notNull().default(''),
    status: text('status').$type<ChatMessageStatus>().notNull().default('complete'),
    position: integer('position').notNull(),
    modelId: text('model_id'),
    provider: text('provider'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningSummary: text('reasoning_summary'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    lastEditedAt: integer('last_edited_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('chat_messages_thread_idx').on(t.threadId),
    index('chat_messages_thread_position_idx').on(t.threadId, t.position),
    index('chat_messages_parent_idx').on(t.parentMessageId),
    index('chat_messages_branch_group_idx').on(t.threadId, t.branchGroupId),
  ],
);

export const chatBranchSelections = sqliteTable(
  'chat_branch_selections',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    branchGroupId: text('branch_group_id').notNull(),
    selectedMessageId: text('selected_message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.branchGroupId] }),
    index('chat_branch_selections_selected_idx').on(t.selectedMessageId),
  ],
);

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

export const booksChatRelations = relations(books, ({ many }) => ({
  chatThreads: many(chatThreads),
}));

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  book: one(books, {
    fields: [chatThreads.bookId],
    references: [books.id],
  }),
  messages: many(chatMessages),
  branchSelections: many(chatBranchSelections),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
  parent: one(chatMessages, {
    fields: [chatMessages.parentMessageId],
    references: [chatMessages.id],
    relationName: 'messageParent',
  }),
  children: many(chatMessages, {
    relationName: 'messageParent',
  }),
}));

export const chatBranchSelectionsRelations = relations(chatBranchSelections, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatBranchSelections.threadId],
    references: [chatThreads.id],
  }),
  selectedMessage: one(chatMessages, {
    fields: [chatBranchSelections.selectedMessageId],
    references: [chatMessages.id],
  }),
}));
