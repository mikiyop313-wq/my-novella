import type Database from 'better-sqlite3';
import { CamelCasePlugin, Kysely, SqliteDialect, type Transaction } from 'kysely';

import type { DatabaseSchema } from '../schema';

export type AppDatabase = Kysely<DatabaseSchema>;
export type DatabaseTransaction = Transaction<DatabaseSchema>;

export function createDatabaseClient(sqlite: Database.Database): AppDatabase {
  sqlite.pragma('foreign_keys = ON');

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [new CamelCasePlugin()],
  });
}
