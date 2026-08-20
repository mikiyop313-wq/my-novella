import type { Kysely } from 'kysely';

// `any` keeps this generated migration independent from the evolving application schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('codexEntryNotes')
    .addColumn('title', 'text', column => column.notNull().defaultTo(''))
    .execute();
}
