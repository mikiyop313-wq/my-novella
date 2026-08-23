import type { Kysely } from 'kysely';

// `any` keeps this generated migration independent from the evolving application schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('generalNotes')
    .addColumn('id', 'text', column => column.primaryKey().notNull())
    .addColumn('bookId', 'text', column =>
      column.notNull().references('books.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', column => column.notNull().defaultTo(''))
    .addColumn('content', 'text', column => column.notNull().defaultTo(''))
    .addColumn('createdAt', 'integer')
    .addColumn('lastEditedAt', 'integer')
    .execute();

  await db.schema
    .createIndex('general_notes_book_title_idx')
    .on('generalNotes')
    .columns(['bookId', 'title'])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('generalNotes').execute();
}
