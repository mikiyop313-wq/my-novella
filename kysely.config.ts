import Database from 'better-sqlite3';
import { defineConfig } from 'kysely-ctl';

import { createDatabaseClient } from './db/core/factory';

const sqlite = new Database('.data/my-novella.db');
const kysely = createDatabaseClient(sqlite);

export default defineConfig({
  kysely,
  migrations: {
    migrationFolder: './db/migrations',
  },
});
