import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from 'kysely/migration';

async function createBookTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('language')
    .addColumn('languageName', 'text', (column) => column.primaryKey().notNull())
    .execute();

  await db.schema
    .createTable('books')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('title', 'text', (column) => column.notNull())
    .addColumn('author', 'text', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('draft'))
    .addColumn('synopsis', 'text')
    .addColumn('language', 'text', (column) =>
      column.notNull().defaultTo('english').references('language.languageName'),
    )
    .addColumn('coverImage', 'blob')
    .addColumn('wordCount', 'integer')
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();

  await db.schema
    .createTable('categories')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('type', 'text', (column) => column.notNull())
    .addColumn('isCustom', 'integer', (column) => column.notNull().defaultTo(0))
    .addUniqueConstraint('categories_name_type_unique', ['name', 'type'])
    .execute();

  await db.schema
    .createTable('subcategories')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('isCustom', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('parentCategoryId', 'text', (column) =>
      column.notNull().references('categories.id').onDelete('cascade'),
    )
    .addUniqueConstraint('subcategories_name_parent_category_id_unique', [
      'name',
      'parentCategoryId',
    ])
    .execute();

  await db.schema
    .createTable('bookTags')
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('categoryId', 'text', (column) =>
      column.notNull().references('categories.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('book_tags_pk', ['bookId', 'categoryId'])
    .execute();

  await db.schema
    .createTable('bookSettings')
    .addColumn('bookSettingId', 'text', (column) =>
      column.primaryKey().notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('language', 'text', (column) =>
      column.notNull().defaultTo('english').references('language.languageName'),
    )
    .addColumn('proseTense', 'text', (column) => column.notNull().defaultTo('past'))
    .addColumn('pointOfView', 'text', (column) =>
      column.notNull().defaultTo('third_limited'),
    )
    .addColumn('synopsisAiContext', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('povCharacterId', 'text')
    .addColumn('embeddingModel', 'text')
    .addColumn('localEmbeddingModel', 'text')
    .addColumn('openrouterEmbeddingModel', 'text')
    .addColumn('vectorSearchEnabled', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('automaticIndexingEnabled', 'integer', (column) =>
      column.notNull().defaultTo(0),
    )
    .execute();
}

async function createNarrativeTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('acts')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('title', 'text', (column) => column.notNull())
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('active'))
    .addColumn('summary', 'text')
    .execute();

  await db.schema
    .createTable('chapters')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('title', 'text', (column) => column.notNull())
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('actId', 'text', (column) =>
      column.references('acts.id').onDelete('set null'),
    )
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('active'))
    .addColumn('archiveParentTitle', 'text')
    .addColumn('summary', 'text')
    .execute();

  await db.schema
    .createTable('scenes')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('title', 'text', (column) => column.notNull())
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('chapterId', 'text', (column) =>
      column.references('chapters.id').onDelete('set null'),
    )
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('active'))
    .addColumn('archiveParentTitle', 'text')
    .addColumn('prose', 'text')
    .addColumn('summary', 'text')
    .addColumn('wordCount', 'integer', (column) => column.defaultTo(0))
    .addColumn('includeInContext', 'integer', (column) => column.notNull().defaultTo(1))
    .addColumn('pointOfViewOverride', 'text')
    .addColumn('povCharacterIdOverride', 'text')
    .execute();
}

async function createCodexTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('codexEntries')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('type', 'text', (column) => column.notNull().defaultTo('character'))
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('alias', 'text')
    .addColumn('description', 'text')
    .addColumn('image', 'blob')
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('active'))
    .addColumn('trackingSetting', 'text', (column) =>
      column.notNull().defaultTo('include_when_detected'),
    )
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();

  await db.schema
    .createIndex('codex_entries_book_type_idx')
    .on('codexEntries')
    .columns(['bookId', 'type'])
    .execute();
  await db.schema
    .createIndex('codex_entries_book_name_idx')
    .on('codexEntries')
    .columns(['bookId', 'name'])
    .execute();

  await db.schema
    .createTable('codexEntryNotes')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('codexEntryId', 'text', (column) =>
      column.notNull().references('codexEntries.id').onDelete('cascade'),
    )
    .addColumn('content', 'text', (column) => column.notNull())
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();
  await db.schema
    .createIndex('codex_entry_notes_entry_idx')
    .on('codexEntryNotes')
    .column('codexEntryId')
    .execute();

  await db.schema
    .createTable('codexEntryProgression')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('codexEntryId', 'text', (column) =>
      column.notNull().references('codexEntries.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (column) => column.notNull().defaultTo(''))
    .addColumn('description', 'text', (column) => column.notNull().defaultTo(''))
    .addColumn('sceneId', 'text', (column) =>
      column.references('scenes.id').onDelete('set null'),
    )
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();
  await db.schema
    .createIndex('codex_entry_progression_entry_idx')
    .on('codexEntryProgression')
    .column('codexEntryId')
    .execute();
  await db.schema
    .createIndex('codex_entry_progression_scene_idx')
    .on('codexEntryProgression')
    .column('sceneId')
    .execute();
}

async function createChatTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('chatThreads')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (column) => column.notNull().defaultTo('New chat'))
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('active'))
    .addColumn('lastModelId', 'text')
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();
  await db.schema.createIndex('chat_threads_book_idx').on('chatThreads').column('bookId').execute();
  await db.schema
    .createIndex('chat_threads_book_status_idx')
    .on('chatThreads')
    .columns(['bookId', 'status'])
    .execute();
  await db.schema
    .createIndex('chat_threads_book_last_edited_idx')
    .on('chatThreads')
    .columns(['bookId', 'lastEditedAt'])
    .execute();

  await db.schema
    .createTable('chatMessages')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('threadId', 'text', (column) =>
      column.notNull().references('chatThreads.id').onDelete('cascade'),
    )
    .addColumn('parentMessageId', 'text', (column) =>
      column.references('chatMessages.id').onDelete('set null'),
    )
    .addColumn('branchGroupId', 'text', (column) => column.notNull())
    .addColumn('branchOrder', 'integer', (column) => column.notNull().defaultTo(0))
    .addColumn('role', 'text', (column) => column.notNull())
    .addColumn('content', 'text', (column) => column.notNull().defaultTo(''))
    .addColumn('status', 'text', (column) => column.notNull().defaultTo('complete'))
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('modelId', 'text')
    .addColumn('provider', 'text')
    .addColumn('inputTokens', 'integer')
    .addColumn('outputTokens', 'integer')
    .addColumn('reasoningSummary', 'text')
    .addColumn('error', 'text')
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();
  await db.schema.createIndex('chat_messages_thread_idx').on('chatMessages').column('threadId').execute();
  await db.schema
    .createIndex('chat_messages_thread_position_idx')
    .on('chatMessages')
    .columns(['threadId', 'position'])
    .execute();
  await db.schema.createIndex('chat_messages_parent_idx').on('chatMessages').column('parentMessageId').execute();
  await db.schema
    .createIndex('chat_messages_branch_group_idx')
    .on('chatMessages')
    .columns(['threadId', 'branchGroupId'])
    .execute();

  await db.schema
    .createTable('chatBranchSelections')
    .addColumn('threadId', 'text', (column) =>
      column.notNull().references('chatThreads.id').onDelete('cascade'),
    )
    .addColumn('branchGroupId', 'text', (column) => column.notNull())
    .addColumn('selectedMessageId', 'text', (column) =>
      column.notNull().references('chatMessages.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('chat_branch_selections_pk', ['threadId', 'branchGroupId'])
    .execute();
  await db.schema
    .createIndex('chat_branch_selections_selected_idx')
    .on('chatBranchSelections')
    .column('selectedMessageId')
    .execute();
}

async function createSystemPromptTables(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('appSettings')
    .addColumn('key', 'text', (column) => column.primaryKey().notNull())
    .addColumn('value', 'text', (column) => column.notNull())
    .execute();

  await db.schema
    .createTable('systemPromptPresets')
    .addColumn('id', 'text', (column) => column.primaryKey().notNull())
    .addColumn('name', 'text', (column) => column.notNull())
    .addColumn('systemPrompt', 'text', (column) => column.notNull())
    .addColumn('category', 'text', (column) => column.notNull())
    .addColumn('scope', 'text', (column) => column.notNull())
    .addColumn('bookId', 'text', (column) =>
      column.references('books.id').onDelete('cascade'),
    )
    .addColumn('temperature', 'real', (column) => column.notNull().defaultTo(0.5))
    .addColumn('topP', 'real', (column) => column.notNull().defaultTo(1))
    .addColumn('maxOutputTokens', 'integer')
    .addColumn('presencePenalty', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('frequencyPenalty', 'real', (column) => column.notNull().defaultTo(0))
    .addColumn('defaultModelId', 'text')
    .addColumn('createdAt', 'integer', (column) => column.notNull())
    .addColumn('lastEditedAt', 'integer', (column) => column.notNull())
    .addCheckConstraint(
      'system_prompt_presets_scope_book_check',
      sql`(scope = 'global' AND book_id IS NULL) OR (scope = 'book' AND book_id IS NOT NULL)`,
    )
    .execute();
  await db.schema
    .createIndex('system_prompt_presets_scope_book_category_idx')
    .on('systemPromptPresets')
    .columns(['scope', 'bookId', 'category'])
    .execute();

  await db.schema
    .createTable('activeSystemPromptPresets')
    .addColumn('bookId', 'text', (column) =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('category', 'text', (column) => column.notNull())
    .addColumn('presetId', 'text', (column) =>
      column.notNull().references('systemPromptPresets.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('active_system_prompt_presets_pk', ['bookId', 'category'])
    .execute();
  await db.schema
    .createIndex('active_system_prompt_presets_preset_idx')
    .on('activeSystemPromptPresets')
    .column('presetId')
    .execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await createBookTables(db);
  await createNarrativeTables(db);
  await createCodexTables(db);
  await createChatTables(db);
  await createSystemPromptTables(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const tables = [
    'activeSystemPromptPresets',
    'systemPromptPresets',
    'appSettings',
    'chatBranchSelections',
    'chatMessages',
    'chatThreads',
    'codexEntryProgression',
    'codexEntryNotes',
    'codexEntries',
    'scenes',
    'chapters',
    'acts',
    'bookSettings',
    'bookTags',
    'subcategories',
    'categories',
    'books',
    'language',
  ] as const;

  for (const table of tables) {
    await db.schema.dropTable(table).execute();
  }
}

export const initialMigration: Migration = { up, down };
