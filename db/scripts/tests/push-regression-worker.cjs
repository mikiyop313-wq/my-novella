const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const Database = require('better-sqlite3');

const projectRoot = resolve(__dirname, '..', '..', '..');
const testDirectory = mkdtempSync(join(__dirname, '.push-regression-'));

try {
  verifyPushRecreatesTableSafely();
  console.log('SQLite db:push regression test passed.');
} finally {
  rmSync(testDirectory, { recursive: true, force: true });
}

function verifyPushRecreatesTableSafely() {
  const databasePath = join(testDirectory, 'push-regression.db');
  const configPath = join(testDirectory, 'drizzle.config.ts');
  const schemaPath = join(__dirname, 'fixtures', 'push-target.schema.ts');
  const database = new Database(databasePath);

  try {
    const compileOptions = database.pragma('compile_options', { simple: false });
    assert.ok(
      compileOptions.some(({ compile_options: option }) => option === 'DQS=0'),
      'better-sqlite3 must keep SQLite double-quoted string literals disabled',
    );

    database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE parents (
        id TEXT PRIMARY KEY NOT NULL
      );

      CREATE TABLE entries (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        parent_id TEXT
      );

      CREATE INDEX entries_title_idx ON entries (title);

      INSERT INTO parents (id) VALUES ('parent-1');
      INSERT INTO entries (id, title, parent_id)
      VALUES ('entry-1', 'Existing entry', 'parent-1');
    `);
  } finally {
    database.close();
  }

  writeFileSync(
    configPath,
    [
      'export default {',
      `  schema: ${JSON.stringify(schemaPath.replaceAll('\\', '/'))},`,
      "  dialect: 'sqlite',",
      '  dbCredentials: {',
      `    url: ${JSON.stringify(databasePath.replaceAll('\\', '/'))},`,
      '  },',
      '};',
      '',
    ].join('\n'),
  );

  const drizzleEnvironment = process.versions.electron
    ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    : process.env;
  run(
    `${quote(process.execPath)} node_modules/drizzle-kit/bin.cjs push --force --config=${quote(configPath)}`,
    { environment: drizzleEnvironment },
  );

  const migratedDatabase = new Database(databasePath, { readonly: true });

  try {
    const entry = migratedDatabase.prepare('SELECT * FROM entries WHERE id = ?').get('entry-1');
    assert.deepEqual(entry, {
      id: 'entry-1',
      title: 'Existing entry',
      parent_id: 'parent-1',
      optional_note: null,
      status: 'draft',
    });

    const foreignKeys = migratedDatabase.prepare("PRAGMA foreign_key_list('entries')").all();
    assert.ok(
      foreignKeys.some(
        ({ from, table, to }) => from === 'parent_id' && table === 'parents' && to === 'id',
      ),
      'entries.parent_id foreign key was not recreated',
    );

    const indexNames = migratedDatabase
      .prepare("PRAGMA index_list('entries')")
      .all()
      .map(({ name }) => name);
    assert.ok(indexNames.includes('entries_title_idx'));
    assert.ok(indexNames.includes('entries_parent_idx'));
    assert.equal(indexNames.length, new Set(indexNames).size, 'duplicate indexes were created');

    const freshTable = migratedDatabase
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fresh_records'")
      .get();
    assert.deepEqual(freshTable, { name: 'fresh_records' });
  } finally {
    migratedDatabase.close();
  }
}

function run(command, { environment = process.env } = {}) {
  const result = spawnSync(command, {
    cwd: projectRoot,
    env: environment,
    shell: true,
    stdio: 'inherit',
  });
  const exitCode = result.status ?? 1;

  if (result.error) {
    throw result.error;
  }

  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
  }
}

function quote(value) {
  return `"${value.replaceAll('"', '\\"')}"`;
}
