import type { Migration, MigrationProvider } from 'kysely/migration';

import { initialMigration } from './migrations/0000_initial';

const migrations: Record<string, Migration> = {
  '0000_initial': initialMigration,
};

export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  },
};
