import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type {
  ChatMessageRole,
  ChatMessageStatus,
  ChatThreadStatus,
} from '../../shared/models/chat.model';
import { books } from './book';
import { codexEntries } from './codex';
import { scene } from './narrative';

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
  ],
);

export const chatMessageSceneRefs = sqliteTable(
  'chat_message_scene_refs',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id')
      .notNull()
      .references(() => scene.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.sceneId] }),
    index('chat_message_scene_refs_scene_idx').on(t.sceneId),
  ],
);

export const chatMessageCodexRefs = sqliteTable(
  'chat_message_codex_refs',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    codexEntryId: text('codex_entry_id')
      .notNull()
      .references(() => codexEntries.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.codexEntryId] }),
    index('chat_message_codex_refs_entry_idx').on(t.codexEntryId),
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
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
  sceneRefs: many(chatMessageSceneRefs),
  codexRefs: many(chatMessageCodexRefs),
}));

export const chatMessageSceneRefsRelations = relations(chatMessageSceneRefs, ({ one }) => ({
  message: one(chatMessages, {
    fields: [chatMessageSceneRefs.messageId],
    references: [chatMessages.id],
  }),
  scene: one(scene, {
    fields: [chatMessageSceneRefs.sceneId],
    references: [scene.id],
  }),
}));

export const chatMessageCodexRefsRelations = relations(chatMessageCodexRefs, ({ one }) => ({
  message: one(chatMessages, {
    fields: [chatMessageCodexRefs.messageId],
    references: [chatMessages.id],
  }),
  codexEntry: one(codexEntries, {
    fields: [chatMessageCodexRefs.codexEntryId],
    references: [codexEntries.id],
  }),
}));
