const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const databasePath = path.resolve(
  process.env['MY_NOVELLA_DB_PATH'] ?? path.join('.data', 'my-novella.db'),
);
const archiveMigrationPath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '0009_detached_narrative_archive.sql',
);
const parentCheckRemovalMigrationPath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '0010_remove_active_narrative_parent_check.sql',
);

async function migrateNarrativeArchive() {
  if (!fs.existsSync(databasePath)) {
    console.log(`Archive migration skipped: database does not exist at ${databasePath}.`);
    return;
  }

  const database = new Database(databasePath);

  try {
    const chapterColumns = getColumnNames(database, 'chapters');
    const sceneColumns = getColumnNames(database, 'scenes');

    if (chapterColumns.size === 0 || sceneColumns.size === 0) {
      console.log('Archive migration skipped: narrative tables do not exist yet.');
      return;
    }

    const chapterHasArchiveColumns = hasArchiveColumns(chapterColumns);
    const sceneHasArchiveColumns = hasArchiveColumns(sceneColumns);

    if (chapterHasArchiveColumns !== sceneHasArchiveColumns) {
      throw new Error(
        'The narrative archive schema is only partially migrated. Restore the database backup before retrying.',
      );
    }

    const chapterHasParentCheck = hasParentCheck(
      database,
      'chapters',
      'chapters_active_parent_check',
    );
    const sceneHasParentCheck = hasParentCheck(
      database,
      'scenes',
      'scenes_active_parent_check',
    );

    if (chapterHasParentCheck !== sceneHasParentCheck) {
      throw new Error(
        'The legacy active-parent constraints exist on only one narrative table. Restore the database backup before retrying.',
      );
    }

    const needsArchiveMigration = !chapterHasArchiveColumns;
    const needsParentCheckRemoval = chapterHasParentCheck;

    if (!needsArchiveMigration && !needsParentCheckRemoval) {
      console.log('Narrative archive migrations already applied.');
      return;
    }

    const failedStagingTables = findFailedStagingTables(database);
    const backupPath = await createBackup(database, databasePath);
    const archiveMigrationSql = needsArchiveMigration
      ? fs.readFileSync(archiveMigrationPath, 'utf8')
      : null;
    const parentCheckRemovalSql = needsParentCheckRemoval
      ? fs.readFileSync(parentCheckRemovalMigrationPath, 'utf8')
      : null;

    database.pragma('foreign_keys = OFF');
    database.transaction(() => {
      for (const tableName of failedStagingTables) {
        database.exec(`DROP TABLE ${tableName}`);
      }
      if (archiveMigrationSql) {
        database.exec(archiveMigrationSql);
      }
      if (parentCheckRemovalSql) {
        database.exec(parentCheckRemovalSql);
      }
    })();
    database.pragma('foreign_keys = ON');

    const foreignKeyErrors = database.pragma('foreign_key_check');
    if (foreignKeyErrors.length > 0) {
      throw new Error(
        `Archive migration completed with foreign-key errors. Restore ${backupPath} before retrying.`,
      );
    }

    console.log(`Narrative archive migrations applied. Backup created at ${backupPath}.`);
  } finally {
    database.close();
  }
}

function getColumnNames(database, tableName) {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map(({ name }) => name));
}

function hasArchiveColumns(columns) {
  return (
    columns.has('book_id')
    && columns.has('archive_parent_title')
  );
}

function hasParentCheck(database, tableName, constraintName) {
  const row = database
    .prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', tableName);

  return (
    typeof row?.sql === 'string'
    && row.sql.includes(constraintName)
  );
}

function findFailedStagingTables(database) {
  const failedStagingTables = [];

  for (const tableName of [
    '__new_scenes',
    '__new_chapters',
    '__check_scenes',
    '__check_chapters',
    '__nullable_scenes',
    '__nullable_chapters',
  ]) {
    const tableExists = database
      .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
      .get('table', tableName);

    if (!tableExists) {
      continue;
    }

    const { count } = database
      .prepare(`SELECT count(*) AS count FROM ${tableName}`)
      .get();

    if (count > 0) {
      throw new Error(
        `Refusing to remove non-empty failed-push table ${tableName}. Restore a known-good database backup before retrying.`,
      );
    }

    failedStagingTables.push(tableName);
  }

  return failedStagingTables;
}

async function createBackup(database, sourcePath) {
  const parsedPath = path.parse(sourcePath);
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const backupPath = path.join(
    parsedPath.dir,
    `${parsedPath.name}.before-archive-${timestamp}${parsedPath.ext || '.sqlite'}`,
  );

  await database.backup(backupPath);
  return backupPath;
}

migrateNarrativeArchive().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
