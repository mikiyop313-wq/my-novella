import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../schema';
import type { UpdateStructurePositionsPayload } from '../../shared/models/manuscript.model';

const mockedDatabase = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('../index', () => ({
  db: mockedDatabase.value,
}));

describe('manuscript archive repositories', () => {
  let sqlite: Database.Database;
  let repository: import('./manuscript.repository').ManuscriptRepository;
  let archiveRepository:
    import('./archived-manuscript.repository').ArchivedManuscriptRepository;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    createSchema(sqlite);
    mockedDatabase.value = drizzle(sqlite, { schema });

    const { ManuscriptRepository } = await import('./manuscript.repository');
    const { ArchivedManuscriptRepository } = await import(
      './archived-manuscript.repository'
    );
    repository = new ManuscriptRepository();
    archiveRepository = new ArchivedManuscriptRepository();
  });

  beforeEach(() => {
    sqlite.exec('DROP TRIGGER IF EXISTS fail_scene_insert;');
    sqlite.exec(`
      DELETE FROM scenes;
      DELETE FROM chapters;
      DELETE FROM acts;
      DELETE FROM books;
    `);
    insertBook(sqlite, 'book-1');
  });

  afterAll(() => {
    sqlite.close();
  });

  it('creates acts and chapters with empty titles so the UI placeholders are shown', async () => {
    const createdAct = await repository.createAct('book-1');
    const createdChapter = await repository.createChapter(createdAct.id);

    expect(createdAct.title).toBe('');
    expect(createdChapter.title).toBe('');
  });

  it('creates an act, initial chapter, and initial scene in one structure operation', async () => {
    const created = await repository.createActStructure('book-1');

    expect(created.act).toMatchObject({ bookId: 'book-1', position: 0, title: '' });
    expect(created.chapter).toMatchObject({ actId: created.act.id, position: 0, title: '' });
    expect(created.scene).toMatchObject({ chapterId: created.chapter.id, position: 0, title: '' });
    expect(row(sqlite, 'acts', created.act.id)).toBeDefined();
    expect(row(sqlite, 'chapters', created.chapter.id)).toBeDefined();
    expect(row(sqlite, 'scenes', created.scene.id)).toBeDefined();
  });

  it('rolls back the full act structure when its initial scene cannot be created', async () => {
    const originalLastEditedAt = row(sqlite, 'books', 'book-1')?.['last_edited_at'];
    sqlite.exec(`
      CREATE TRIGGER fail_scene_insert
      BEFORE INSERT ON scenes
      BEGIN
        SELECT RAISE(ABORT, 'scene insert failed');
      END;
    `);

    await expect(repository.createActStructure('book-1')).rejects.toThrow('scene insert failed');

    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM acts').get()).toMatchObject({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM chapters').get()).toMatchObject({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM scenes').get()).toMatchObject({ count: 0 });
    expect(row(sqlite, 'books', 'book-1')?.['last_edited_at']).toBe(originalLastEditedAt);
  });

  it('rolls back a new chapter when its initial scene cannot be created', async () => {
    insertAct(sqlite, 'act-1', 'Existing Act', 'active');
    sqlite.exec(`
      CREATE TRIGGER fail_scene_insert
      BEFORE INSERT ON scenes
      BEGIN
        SELECT RAISE(ABORT, 'scene insert failed');
      END;
    `);

    await expect(repository.createChapterStructure('act-1')).rejects.toThrow('scene insert failed');

    expect(row(sqlite, 'acts', 'act-1')).toBeDefined();
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM chapters').get()).toMatchObject({ count: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM scenes').get()).toMatchObject({ count: 0 });
  });

  it('deletes active descendants while detaching archived descendants from an active act', async () => {
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-active', 'Active Chapter', 'act-1', 'active');
    insertChapter(sqlite, 'chapter-archived', 'Archived Chapter', 'act-1', 'archived', 'Active Act');
    insertScene(sqlite, 'scene-active', 'Active Scene', 'chapter-active', 'active');
    insertScene(
      sqlite,
      'scene-detached',
      'Archived Scene',
      'chapter-active',
      'archived',
      'Active Chapter',
    );
    insertScene(
      sqlite,
      'scene-nested',
      'Nested Archived Scene',
      'chapter-archived',
      'archived',
      'Archived Chapter',
    );

    await repository.deleteAct('act-1');

    expect(row(sqlite, 'acts', 'act-1')).toBeUndefined();
    expect(row(sqlite, 'chapters', 'chapter-active')).toBeUndefined();
    expect(row(sqlite, 'scenes', 'scene-active')).toBeUndefined();
    expect(row(sqlite, 'chapters', 'chapter-archived')).toMatchObject({ act_id: null });
    expect(row(sqlite, 'scenes', 'scene-detached')).toMatchObject({ chapter_id: null });
    expect(row(sqlite, 'scenes', 'scene-nested')).toMatchObject({
      chapter_id: 'chapter-archived',
    });

    const overview = await archiveRepository.getArchiveOverview('book-1');
    expect(overview.archivedChapters.map(({ id }) => id)).toEqual(['chapter-archived']);
    expect(overview.archivedScenes.map(({ id }) => id)).toEqual(['scene-detached']);
  });

  it('preserves archived scenes when their active chapter is deleted', async () => {
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-active', 'Active Chapter', 'act-1', 'active');
    insertScene(sqlite, 'scene-active', 'Active Scene', 'chapter-active', 'active');
    insertScene(
      sqlite,
      'scene-archived',
      'Archived Scene',
      'chapter-active',
      'archived',
      'Active Chapter',
    );

    await repository.deleteChapter('chapter-active');

    expect(row(sqlite, 'chapters', 'chapter-active')).toBeUndefined();
    expect(row(sqlite, 'scenes', 'scene-active')).toBeUndefined();
    expect(row(sqlite, 'scenes', 'scene-archived')).toMatchObject({ chapter_id: null });
  });

  it('permanently deletes the subtree of an archived parent', async () => {
    insertAct(sqlite, 'act-archived', 'Archived Act', 'archived');
    insertChapter(
      sqlite,
      'chapter-archived',
      'Archived Chapter',
      'act-archived',
      'archived',
      'Archived Act',
    );
    insertScene(
      sqlite,
      'scene-archived',
      'Archived Scene',
      'chapter-archived',
      'archived',
      'Archived Chapter',
    );

    await repository.deleteAct('act-archived');

    expect(row(sqlite, 'acts', 'act-archived')).toBeUndefined();
    expect(row(sqlite, 'chapters', 'chapter-archived')).toBeUndefined();
    expect(row(sqlite, 'scenes', 'scene-archived')).toBeUndefined();
  });

  it('uses the newly selected parent ID and title after restore and rearchive', async () => {
    insertAct(sqlite, 'act-new', 'New Act', 'active');
    insertChapter(sqlite, 'chapter-new', 'New Chapter', 'act-new', 'active');
    insertChapter(
      sqlite,
      'chapter-detached',
      'Detached Chapter',
      null,
      'archived',
      'Deleted Act',
    );
    insertScene(
      sqlite,
      'scene-detached',
      'Detached Scene',
      null,
      'archived',
      'Deleted Chapter',
    );

    await archiveRepository.restoreChapter('chapter-detached', 'act-new');
    expect(row(sqlite, 'chapters', 'chapter-detached')).toMatchObject({
      act_id: 'act-new',
      status: 'active',
      archive_parent_title: null,
    });

    await archiveRepository.archiveChapter('chapter-detached');
    expect(row(sqlite, 'chapters', 'chapter-detached')).toMatchObject({
      act_id: 'act-new',
      status: 'archived',
      archive_parent_title: 'New Act',
    });

    await archiveRepository.restoreScene('scene-detached', 'chapter-new');
    expect(row(sqlite, 'scenes', 'scene-detached')).toMatchObject({
      chapter_id: 'chapter-new',
      status: 'active',
      archive_parent_title: null,
    });

    await archiveRepository.archiveScene('scene-detached');
    expect(row(sqlite, 'scenes', 'scene-detached')).toMatchObject({
      chapter_id: 'chapter-new',
      status: 'archived',
      archive_parent_title: 'New Chapter',
    });
  });

  it('rejects missing parents at active repository write boundaries', async () => {
    await expect(
      repository.updateStructurePositions({
        chapters: [{ id: 'chapter-active-orphan', actId: null, position: 0 }],
      } as unknown as UpdateStructurePositionsPayload),
    ).rejects.toThrow('An active chapter must have a parent act.');
    await expect(
      repository.updateStructurePositions({
        scenes: [{ id: 'scene-active-orphan', chapterId: null, position: 0 }],
      } as unknown as UpdateStructurePositionsPayload),
    ).rejects.toThrow('An active scene must have a parent chapter.');

    expect(() => {
      insertChapter(sqlite, 'chapter-archived-orphan', 'Archived Orphan', null, 'archived');
      insertScene(sqlite, 'scene-archived-orphan', 'Archived Orphan', null, 'archived');
    }).not.toThrow();
  });

  it('still cascades complete book deletion with nullable parent IDs', () => {
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-1', 'Active Chapter', 'act-1', 'active');
    insertScene(sqlite, 'scene-1', 'Active Scene', 'chapter-1', 'active');

    expect(() => {
      sqlite.prepare('DELETE FROM books WHERE id = ?').run('book-1');
    }).not.toThrow();
    expect(row(sqlite, 'acts', 'act-1')).toBeUndefined();
    expect(row(sqlite, 'chapters', 'chapter-1')).toBeUndefined();
    expect(row(sqlite, 'scenes', 'scene-1')).toBeUndefined();
  });

  it('persists context inclusion and derives parent state from eligible scenes', async () => {
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-1', 'Active Chapter', 'act-1', 'active');
    insertScene(sqlite, 'scene-filled', 'Filled Scene', 'chapter-1', 'active');
    insertScene(sqlite, 'scene-empty', 'Empty Scene', 'chapter-1', 'active');
    sqlite.prepare('UPDATE scenes SET summary = ? WHERE id = ?').run('A summary', 'scene-filled');

    let outline = await repository.setContextInclusion({
      entityType: 'chapter',
      id: 'chapter-1',
      included: false,
    });
    expect(outline[0].isIncludedInContext).toBe(false);
    expect(outline[0].chapters?.[0].scenes?.map((item) => item.includeInContext))
      .toEqual([false, false]);

    outline = await repository.setContextInclusion({
      entityType: 'scene',
      id: 'scene-filled',
      included: true,
    });
    expect(outline[0].isIncludedInContext).toBe(true);
    expect(outline[0].chapters?.[0].isIncludedInContext).toBe(true);
    expect(outline[0].chapters?.[0].scenes?.[0].isIncludedInContext).toBe(true);
    expect(outline[0].chapters?.[0].scenes?.[1].isIncludedInContext).toBe(false);
  });

  it('updates an act subtree and rejects archived context targets', async () => {
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-1', 'Active Chapter', 'act-1', 'active');
    insertScene(sqlite, 'scene-1', 'Scene', 'chapter-1', 'active');
    sqlite.prepare('UPDATE scenes SET word_count = 10 WHERE id = ?').run('scene-1');

    const outline = await repository.setContextInclusion({
      entityType: 'act',
      id: 'act-1',
      included: false,
    });
    expect(outline[0].isIncludedInContext).toBe(false);
    expect(row(sqlite, 'scenes', 'scene-1')).toMatchObject({ include_in_context: 0 });

    await archiveRepository.archiveScene('scene-1');
    await expect(repository.setContextInclusion({
      entityType: 'scene',
      id: 'scene-1',
      included: true,
    })).rejects.toThrow('The active scene could not be found.');
  });
});

describe('detached narrative archive migration', () => {
  it('backfills book ownership and parent titles and changes parent deletion to SET NULL', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    createLegacySchema(sqlite);
    insertBook(sqlite, 'book-1');
    insertLegacyHierarchy(sqlite);

    const archiveMigration = readFileSync(
      new URL('../migrations/0009_detached_narrative_archive.sql', import.meta.url),
      'utf8',
    );
    sqlite.exec(archiveMigration);

    expect(row(sqlite, 'chapters', 'chapter-legacy')).toMatchObject({
      book_id: 'book-1',
      act_id: 'act-legacy',
      archive_parent_title: 'Legacy Act',
    });
    expect(row(sqlite, 'scenes', 'scene-legacy')).toMatchObject({
      book_id: 'book-1',
      chapter_id: 'chapter-legacy',
      archive_parent_title: 'Legacy Chapter',
    });

    sqlite.prepare('DELETE FROM acts WHERE id = ?').run('act-legacy');
    expect(row(sqlite, 'chapters', 'chapter-legacy')).toMatchObject({ act_id: null });

    sqlite.close();
  });

  it('removes legacy database checks while retaining nullable parent columns', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    createSchemaWithParentChecks(sqlite);
    insertBook(sqlite, 'book-1');
    insertAct(sqlite, 'act-1', 'Active Act', 'active');
    insertChapter(sqlite, 'chapter-1', 'Active Chapter', 'act-1', 'active');
    insertScene(sqlite, 'scene-1', 'Active Scene', 'chapter-1', 'active');

    const removalMigration = readFileSync(
      new URL(
        '../migrations/0010_remove_active_narrative_parent_check.sql',
        import.meta.url,
      ),
      'utf8',
    );
    sqlite.exec(removalMigration);

    const chapterSql = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chapters'")
      .pluck()
      .get() as string;
    const sceneSql = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'scenes'")
      .pluck()
      .get() as string;
    expect(chapterSql).not.toContain('chapters_active_parent_check');
    expect(sceneSql).not.toContain('scenes_active_parent_check');

    expect(() => {
      insertChapter(sqlite, 'chapter-active-orphan', 'Active Orphan', null, 'active');
      insertScene(sqlite, 'scene-active-orphan', 'Active Orphan', null, 'active');
    }).not.toThrow();
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    sqlite.close();
  });
});

function createSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE books (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      author text NOT NULL,
      status text NOT NULL,
      last_edited_at integer
    );
    CREATE TABLE acts (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL,
      summary text
    );
    CREATE TABLE chapters (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      act_id text REFERENCES acts(id) ON DELETE SET NULL,
      position integer NOT NULL,
      status text NOT NULL,
      archive_parent_title text,
      summary text
    );
    CREATE TABLE scenes (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_id text REFERENCES chapters(id) ON DELETE SET NULL,
      position integer NOT NULL,
      status text NOT NULL,
      archive_parent_title text,
      prose text,
      summary text,
      word_count integer DEFAULT 0,
      include_in_context integer NOT NULL DEFAULT 1,
      point_of_view_override text,
      pov_character_id_override text
    );
  `);
}

function createSchemaWithParentChecks(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE books (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      author text NOT NULL,
      status text NOT NULL,
      last_edited_at integer
    );
    CREATE TABLE acts (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL,
      summary text
    );
    CREATE TABLE chapters (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      act_id text REFERENCES acts(id) ON DELETE SET NULL,
      position integer NOT NULL,
      status text NOT NULL,
      archive_parent_title text,
      summary text,
      CONSTRAINT chapters_active_parent_check
        CHECK (status = 'archived' OR act_id IS NOT NULL)
    );
    CREATE TABLE scenes (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_id text REFERENCES chapters(id) ON DELETE SET NULL,
      position integer NOT NULL,
      status text NOT NULL,
      archive_parent_title text,
      prose text,
      summary text,
      word_count integer DEFAULT 0,
      point_of_view_override text,
      pov_character_id_override text,
      CONSTRAINT scenes_active_parent_check
        CHECK (status = 'archived' OR chapter_id IS NOT NULL)
    );
  `);
}

function createLegacySchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE books (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      author text NOT NULL,
      status text NOT NULL,
      last_edited_at integer
    );
    CREATE TABLE acts (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      book_id text NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL,
      summary text
    );
    CREATE TABLE chapters (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      act_id text NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL,
      summary text
    );
    CREATE TABLE scenes (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      position integer NOT NULL,
      status text NOT NULL,
      prose text,
      summary text,
      word_count integer DEFAULT 0,
      point_of_view_override text,
      pov_character_id_override text
    );
  `);
}

function insertLegacyHierarchy(sqlite: Database.Database): void {
  sqlite
    .prepare(
      'INSERT INTO acts (id, title, book_id, position, status) VALUES (?, ?, ?, ?, ?)',
    )
    .run('act-legacy', 'Legacy Act', 'book-1', 0, 'archived');
  sqlite
    .prepare(
      'INSERT INTO chapters (id, title, act_id, position, status) VALUES (?, ?, ?, ?, ?)',
    )
    .run('chapter-legacy', 'Legacy Chapter', 'act-legacy', 0, 'archived');
  sqlite
    .prepare(
      'INSERT INTO scenes (id, title, chapter_id, position, status) VALUES (?, ?, ?, ?, ?)',
    )
    .run('scene-legacy', 'Legacy Scene', 'chapter-legacy', 0, 'archived');
}

function insertBook(sqlite: Database.Database, id: string): void {
  sqlite
    .prepare('INSERT INTO books (id, title, author, status) VALUES (?, ?, ?, ?)')
    .run(id, 'Test Book', 'Test Author', 'draft');
}

function insertAct(
  sqlite: Database.Database,
  id: string,
  title: string,
  status: 'active' | 'archived',
): void {
  sqlite
    .prepare(
      'INSERT INTO acts (id, title, book_id, position, status) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, title, 'book-1', 0, status);
}

function insertChapter(
  sqlite: Database.Database,
  id: string,
  title: string,
  actId: string | null,
  status: 'active' | 'archived',
  archiveParentTitle: string | null = null,
): void {
  sqlite
    .prepare(
      `INSERT INTO chapters
        (id, title, book_id, act_id, position, status, archive_parent_title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, title, 'book-1', actId, 0, status, archiveParentTitle);
}

function insertScene(
  sqlite: Database.Database,
  id: string,
  title: string,
  chapterId: string | null,
  status: 'active' | 'archived',
  archiveParentTitle: string | null = null,
): void {
  sqlite
    .prepare(
      `INSERT INTO scenes
        (id, title, book_id, chapter_id, position, status, archive_parent_title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, title, 'book-1', chapterId, 0, status, archiveParentTitle);
}

function row(
  sqlite: Database.Database,
  table: 'acts' | 'chapters' | 'scenes',
  id: string,
): Record<string, unknown> | undefined {
  return sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
}
