import { Migrator } from 'kysely/migration';

import { migrationProvider } from '../migration-provider';
import type { AppDatabase } from './factory';

export async function migrateDatabase(database: AppDatabase): Promise<void> {
  const migrator = new Migrator({ db: database, provider: migrationProvider });
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      console.log(`Migration ${result.migrationName} applied.`);
    } else if (result.status === 'Error') {
      console.error(`Migration ${result.migrationName} failed.`);
    }
  }

  if (error) {
    throw error;
  }
}
