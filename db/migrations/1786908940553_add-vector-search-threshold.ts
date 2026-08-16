import type { Kysely } from 'kysely';

// `any` keeps this generated migration independent from the evolving application schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('bookSettings')
    .addColumn('vectorSearchThresholdEnabled', 'integer', column => (
      column.notNull().defaultTo(0)
    ))
    .execute();

  await db.schema
    .alterTable('bookSettings')
    .addColumn('vectorSearchSimilarityThreshold', 'real', column => (
      column.notNull().defaultTo(0.7)
    ))
    .execute();
}
