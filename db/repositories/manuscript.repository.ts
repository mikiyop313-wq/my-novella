import { randomUUID } from 'crypto';
import { sql } from 'kysely';

import type {
  ActDto,
  ChapterDto,
  CreatedActStructureDto,
  CreatedChapterStructureDto,
  ManuscriptDataDto,
  ManuscriptMode,
  SceneDto,
  SetContextInclusionPayload,
  TiptapJsonDoc,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
  UpdateStructurePositionsPayload,
} from '../../shared/models/manuscript.model';
import { withEffectiveContextInclusion } from '../../shared/utils/manuscript-context-inclusion';
import { db } from '../index';
import type { ActRow, ChapterRow, SceneRow } from '../schema';
import {
  fromSqliteBoolean,
  parseSqliteJson,
  serializeSqliteJson,
  toSqliteBoolean,
  toSqliteTimestamp,
} from '../core/sqlite-values';

type HierarchySceneRow = Omit<SceneRow, 'prose'> & { prose?: string | null };

export class ManuscriptRepository {
  private mapScene(row: HierarchySceneRow): SceneDto {
    return {
      id: row.id,
      title: row.title,
      chapterId: row.chapterId!,
      position: row.position,
      status: row.status,
      prose: parseSqliteJson<TiptapJsonDoc>(row.prose ?? null),
      summary: row.summary,
      wordCount: row.wordCount,
      pointOfViewOverride: row.pointOfViewOverride,
      povCharacterIdOverride: row.povCharacterIdOverride,
      includeInContext: fromSqliteBoolean(row.includeInContext),
    };
  }

  private mapChapter(row: ChapterRow, scenes: SceneDto[] = []): ChapterDto {
    return {
      id: row.id,
      title: row.title,
      actId: row.actId!,
      position: row.position,
      status: row.status,
      summary: row.summary,
      scenes,
    };
  }

  private mapAct(row: ActRow, chapters: ChapterDto[] = []): ActDto {
    return {
      id: row.id,
      title: row.title,
      bookId: row.bookId,
      position: row.position,
      status: row.status,
      summary: row.summary,
      chapters,
    };
  }

  private async loadActiveHierarchy(bookId: string, includeProse: boolean): Promise<ActDto[]> {
    const acts = await db.selectFrom('acts').selectAll().where('bookId', '=', bookId).where('status', '=', 'active').orderBy('position').execute();
    if (acts.length === 0) return [];

    const actIds = acts.map(({ id }) => id);
    const chapters = await db.selectFrom('chapters').selectAll().where('actId', 'in', actIds).where('status', '=', 'active').orderBy('position').execute();
    const chapterIds = chapters.map(({ id }) => id);
    let scenes: HierarchySceneRow[] = [];
    if (chapterIds.length > 0) {
      if (includeProse) {
        scenes = await db.selectFrom('scenes').selectAll().where('chapterId', 'in', chapterIds).where('status', '=', 'active').orderBy('position').execute();
      } else {
        scenes = await db
          .selectFrom('scenes')
          .select([
            'id', 'title', 'bookId', 'chapterId', 'position', 'status', 'archiveParentTitle',
            'summary', 'wordCount', 'includeInContext', 'pointOfViewOverride', 'povCharacterIdOverride',
          ])
          .where('chapterId', 'in', chapterIds)
          .where('status', '=', 'active')
          .orderBy('position')
          .execute();
      }
    }

    const scenesByChapter = new Map<string, SceneDto[]>();
    for (const scene of scenes) {
      if (scene.chapterId) {
        const rows = scenesByChapter.get(scene.chapterId) ?? [];
        rows.push(this.mapScene(scene));
        scenesByChapter.set(scene.chapterId, rows);
      }
    }
    const chaptersByAct = new Map<string, ChapterDto[]>();
    for (const chapter of chapters) {
      if (chapter.actId) {
        const rows = chaptersByAct.get(chapter.actId) ?? [];
        rows.push(this.mapChapter(chapter, scenesByChapter.get(chapter.id) ?? []));
        chaptersByAct.set(chapter.actId, rows);
      }
    }
    return acts.map((act) => this.mapAct(act, chaptersByAct.get(act.id) ?? []));
  }

  async getManuscript(mode: ManuscriptMode, id: string): Promise<ManuscriptDataDto> {
    if (mode === 'book') return this.loadActiveHierarchy(id, true);
    if (mode === 'act') {
      const act = await db.selectFrom('acts').selectAll().where('id', '=', id).where('status', '=', 'active').executeTakeFirst();
      if (!act) return undefined as unknown as ActDto;
      const hierarchy = await this.loadActiveHierarchy(act.bookId, true);
      return hierarchy.find((item) => item.id === id) as ActDto;
    }
    if (mode === 'chapter') {
      if (!(await this.isActiveManuscriptPath(mode, id))) return undefined as unknown as ChapterDto;
      const chapter = await db.selectFrom('chapters').selectAll().where('id', '=', id).where('status', '=', 'active').executeTakeFirst();
      if (!chapter) return undefined as unknown as ChapterDto;
      const scenes = await db.selectFrom('scenes').selectAll().where('chapterId', '=', id).where('status', '=', 'active').orderBy('position').execute();
      return this.mapChapter(chapter, scenes.map((scene) => this.mapScene(scene)));
    }
    if (mode === 'scene') {
      if (!(await this.isActiveManuscriptPath(mode, id))) return undefined as unknown as SceneDto;
      const scene = await db.selectFrom('scenes').selectAll().where('id', '=', id).where('status', '=', 'active').executeTakeFirst();
      return scene ? this.mapScene(scene) : (undefined as unknown as SceneDto);
    }
    throw new Error('Invalid manuscript mode');
  }

  async getScenesProse(sceneIds: string[]): Promise<Record<string, TiptapJsonDoc | null>> {
    if (sceneIds.length === 0) return {};
    const rows = await db.selectFrom('scenes').select(['id', 'prose']).where('id', 'in', sceneIds).execute();
    return Object.fromEntries(rows.map((row) => [row.id, parseSqliteJson<TiptapJsonDoc>(row.prose)]));
  }

  async getBookHierarchy(mode: ManuscriptMode, id: string): Promise<ActDto[]> {
    const bookId = await this.getBookIdForTarget(mode, id);
    if (!bookId) return [];
    return withEffectiveContextInclusion(await this.loadActiveHierarchy(bookId, false));
  }

  async getOutline(bookId: string): Promise<ActDto[]> {
    return withEffectiveContextInclusion(await this.loadActiveHierarchy(bookId, false));
  }

  async setContextInclusion(payload: SetContextInclusionPayload): Promise<ActDto[]> {
    const target = await this.resolveActiveContextTarget(payload);
    if (!target) throw new Error(`The active ${payload.entityType} could not be found.`);
    const included = toSqliteBoolean(payload.included);
    await db.transaction().execute(async (transaction) => {
      if (payload.entityType === 'scene') {
        await transaction.updateTable('scenes').set({ includeInContext: included }).where('id', '=', payload.id).where('status', '=', 'active').execute();
        return;
      }
      if (payload.entityType === 'chapter') {
        await transaction.updateTable('scenes').set({ includeInContext: included }).where('chapterId', '=', payload.id).where('status', '=', 'active').execute();
        return;
      }
      const chapters = await transaction.selectFrom('chapters').select('id').where('actId', '=', payload.id).where('status', '=', 'active').execute();
      const chapterIds = chapters.map(({ id }) => id);
      if (chapterIds.length > 0) {
        await transaction.updateTable('scenes').set({ includeInContext: included }).where('chapterId', 'in', chapterIds).where('status', '=', 'active').execute();
      }
    });
    return this.getOutline(target.bookId);
  }

  async createAct(bookId: string): Promise<ActDto> {
    const row = await db.selectFrom('acts').select(sql<number | null>`max(position)`.as('maxPos')).where('bookId', '=', bookId).where('status', '=', 'active').executeTakeFirst();
    const inserted = await db.insertInto('acts').values({ id: randomUUID(), title: '', bookId, position: (row?.maxPos ?? -1) + 1, status: 'active', summary: null }).returningAll().executeTakeFirstOrThrow();
    await this.touchBookLastEdited('book', bookId);
    return this.mapAct(inserted);
  }

  async createChapter(actId: string): Promise<ChapterDto> {
    this.assertActiveParentId('chapter', actId);
    const parent = await db.selectFrom('acts').selectAll().where('id', '=', actId).executeTakeFirst();
    if (!parent) throw new Error('The parent act for this chapter could not be found.');
    const row = await db.selectFrom('chapters').select(sql<number | null>`max(position)`.as('maxPos')).where('actId', '=', actId).where('status', '=', 'active').executeTakeFirst();
    const inserted = await db.insertInto('chapters').values({ id: randomUUID(), title: '', bookId: parent.bookId, actId, position: (row?.maxPos ?? -1) + 1, status: 'active', archiveParentTitle: null, summary: null }).returningAll().executeTakeFirstOrThrow();
    await this.touchBookLastEdited('act', actId);
    return this.mapChapter(inserted);
  }

  async createScene(chapterId: string): Promise<SceneDto> {
    this.assertActiveParentId('scene', chapterId);
    const parent = await db.selectFrom('chapters').selectAll().where('id', '=', chapterId).executeTakeFirst();
    if (!parent) throw new Error('The parent chapter for this scene could not be found.');
    const row = await db.selectFrom('scenes').select(sql<number | null>`max(position)`.as('maxPos')).where('chapterId', '=', chapterId).where('status', '=', 'active').executeTakeFirst();
    const inserted = await db.insertInto('scenes').values({ id: randomUUID(), title: '', bookId: parent.bookId, chapterId, position: (row?.maxPos ?? -1) + 1, status: 'active', archiveParentTitle: null, prose: null, summary: null, wordCount: 0, includeInContext: 1, pointOfViewOverride: null, povCharacterIdOverride: null }).returningAll().executeTakeFirstOrThrow();
    await this.touchBookLastEdited('chapter', chapterId);
    return this.mapScene(inserted);
  }

  async createActStructure(bookId: string): Promise<CreatedActStructureDto> {
    return db.transaction().execute(async (transaction) => {
      const maxRow = await transaction.selectFrom('acts').select(sql<number | null>`max(position)`.as('maxPos')).where('bookId', '=', bookId).where('status', '=', 'active').executeTakeFirst();
      const act = await transaction.insertInto('acts').values({ id: randomUUID(), title: '', bookId, position: (maxRow?.maxPos ?? -1) + 1, status: 'active', summary: null }).returningAll().executeTakeFirstOrThrow();
      const chapter = await transaction.insertInto('chapters').values({ id: randomUUID(), title: '', bookId, actId: act.id, position: 0, status: 'active', archiveParentTitle: null, summary: null }).returningAll().executeTakeFirstOrThrow();
      const scene = await transaction.insertInto('scenes').values({ id: randomUUID(), title: '', bookId, chapterId: chapter.id, position: 0, status: 'active', archiveParentTitle: null, prose: null, summary: null, wordCount: 0, includeInContext: 1, pointOfViewOverride: null, povCharacterIdOverride: null }).returningAll().executeTakeFirstOrThrow();
      await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', bookId).execute();
      return { act: this.mapAct(act), chapter: this.mapChapter(chapter), scene: this.mapScene(scene) };
    });
  }

  async createChapterStructure(actId: string): Promise<CreatedChapterStructureDto> {
    return db.transaction().execute(async (transaction) => {
      const parent = await transaction.selectFrom('acts').selectAll().where('id', '=', actId).executeTakeFirst();
      if (!parent) throw new Error('The parent act for this chapter could not be found.');
      const maxRow = await transaction.selectFrom('chapters').select(sql<number | null>`max(position)`.as('maxPos')).where('actId', '=', actId).where('status', '=', 'active').executeTakeFirst();
      const chapter = await transaction.insertInto('chapters').values({ id: randomUUID(), title: '', bookId: parent.bookId, actId, position: (maxRow?.maxPos ?? -1) + 1, status: 'active', archiveParentTitle: null, summary: null }).returningAll().executeTakeFirstOrThrow();
      const scene = await transaction.insertInto('scenes').values({ id: randomUUID(), title: '', bookId: parent.bookId, chapterId: chapter.id, position: 0, status: 'active', archiveParentTitle: null, prose: null, summary: null, wordCount: 0, includeInContext: 1, pointOfViewOverride: null, povCharacterIdOverride: null }).returningAll().executeTakeFirstOrThrow();
      await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', parent.bookId).execute();
      return { chapter: this.mapChapter(chapter), scene: this.mapScene(scene) };
    });
  }

  async updateAct(payload: UpdateActPayload): Promise<ActDto> {
    const { id, ...data } = payload;
    const updated = await db.updateTable('acts').set(data).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchBookLastEdited('book', updated.bookId);
    return updated ? this.mapAct(updated) : (undefined as unknown as ActDto);
  }

  async updateChapter(payload: UpdateChapterPayload): Promise<ChapterDto> {
    const { id, ...data } = payload;
    const updated = await db.updateTable('chapters').set(data).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchBookLastEdited('book', updated.bookId);
    return updated ? this.mapChapter(updated) : (undefined as unknown as ChapterDto);
  }

  async updateScene(payload: UpdateScenePayload): Promise<SceneDto> {
    const { id, prose, ...data } = payload;
    const update = prose === undefined ? data : { ...data, prose: serializeSqliteJson(prose) };
    const updated = await db.updateTable('scenes').set(update).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchBookLastEdited('book', updated.bookId);
    return updated ? this.mapScene(updated) : (undefined as unknown as SceneDto);
  }

  async updateStructurePositions(payload: UpdateStructurePositionsPayload): Promise<void> {
    for (const item of payload.chapters ?? []) this.assertActiveParentId('chapter', item.actId);
    for (const item of payload.scenes ?? []) this.assertActiveParentId('scene', item.chapterId);
    await db.transaction().execute(async (transaction) => {
      for (const item of payload.acts ?? []) {
        await transaction.updateTable('acts').set({ position: item.position }).where('id', '=', item.id).where('bookId', '=', item.bookId).where('status', '=', 'active').execute();
      }
      for (const item of payload.chapters ?? []) {
        await transaction.updateTable('chapters').set({ actId: item.actId, position: item.position }).where('id', '=', item.id).where('status', '=', 'active').execute();
      }
      for (const item of payload.scenes ?? []) {
        await transaction.updateTable('scenes').set({ chapterId: item.chapterId, position: item.position }).where('id', '=', item.id).where('status', '=', 'active').execute();
      }
    });
    await this.touchBookAfterStructureUpdate(payload);
  }

  async deleteAct(id: string): Promise<void> {
    const target = await db.selectFrom('acts').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target) return;
    const chapterRows = await db.selectFrom('chapters').select('id').where('actId', '=', id).execute();
    const chapterIds = chapterRows.map(({ id }) => id);
    await db.transaction().execute(async (transaction) => {
      if (chapterIds.length > 0) {
        let sceneDelete = transaction.deleteFrom('scenes').where('chapterId', 'in', chapterIds);
        if (target.status === 'active') sceneDelete = sceneDelete.where('status', '=', 'active');
        await sceneDelete.execute();
      }
      let chapterDelete = transaction.deleteFrom('chapters').where('actId', '=', id);
      if (target.status === 'active') chapterDelete = chapterDelete.where('status', '=', 'active');
      await chapterDelete.execute();
      await transaction.deleteFrom('acts').where('id', '=', id).execute();
      if (target.status === 'active') {
        await transaction.updateTable('acts').set({ position: sql`position - 1` }).where('bookId', '=', target.bookId).where('status', '=', 'active').where('position', '>', target.position).execute();
      }
      await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', target.bookId).execute();
    });
  }

  async deleteChapter(id: string): Promise<void> {
    const target = await db.selectFrom('chapters').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target) return;
    await db.transaction().execute(async (transaction) => {
      let sceneDelete = transaction.deleteFrom('scenes').where('chapterId', '=', id);
      if (target.status === 'active') sceneDelete = sceneDelete.where('status', '=', 'active');
      await sceneDelete.execute();
      await transaction.deleteFrom('chapters').where('id', '=', id).execute();
      if (target.status === 'active' && target.actId) {
        await transaction.updateTable('chapters').set({ position: sql`position - 1` }).where('actId', '=', target.actId).where('status', '=', 'active').where('position', '>', target.position).execute();
      }
      await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', target.bookId).execute();
    });
  }

  async deleteScene(id: string): Promise<void> {
    const target = await db.selectFrom('scenes').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target) return;
    await db.transaction().execute(async (transaction) => {
      await transaction.deleteFrom('scenes').where('id', '=', id).execute();
      if (target.status === 'active' && target.chapterId) {
        await transaction.updateTable('scenes').set({ position: sql`position - 1` }).where('chapterId', '=', target.chapterId).where('status', '=', 'active').where('position', '>', target.position).execute();
      }
      await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', target.bookId).execute();
    });
  }

  async getWordCount(mode: ManuscriptMode, id: string): Promise<number> {
    let query = db.selectFrom('scenes').innerJoin('chapters', 'chapters.id', 'scenes.chapterId').innerJoin('acts', 'acts.id', 'chapters.actId').where('scenes.status', '=', 'active').where('chapters.status', '=', 'active').where('acts.status', '=', 'active');
    if (mode === 'scene') {
      const result = await query.select('scenes.wordCount').where('scenes.id', '=', id).executeTakeFirst();
      return result?.wordCount ?? 0;
    }
    if (mode === 'chapter') query = query.where('scenes.chapterId', '=', id);
    else if (mode === 'act') query = query.where('chapters.actId', '=', id);
    else if (mode === 'book') query = query.where('acts.bookId', '=', id);
    else return 0;
    const result = await query.select(sql<number | null>`sum(coalesce(scenes.word_count, 0))`.as('sum')).executeTakeFirst();
    return Number(result?.sum ?? 0);
  }

  async getChapterCount(bookId: string): Promise<number> {
    const result = await db.selectFrom('chapters').innerJoin('acts', 'acts.id', 'chapters.actId').select(sql<number>`count(chapters.id)`.as('count')).where('acts.bookId', '=', bookId).where('acts.status', '=', 'active').where('chapters.status', '=', 'active').executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  private assertActiveParentId(entity: 'chapter' | 'scene', parentId: string | null | undefined): void {
    if (!parentId) throw new Error(`An active ${entity} must have a parent ${entity === 'chapter' ? 'act' : 'chapter'}.`);
  }

  async getBookIdForTarget(mode: ManuscriptMode, id: string): Promise<string | undefined> {
    if (mode === 'book') return id;
    const table = mode === 'act' ? 'acts' : mode === 'chapter' ? 'chapters' : 'scenes';
    const row = await db.selectFrom(table).select('bookId').where('id', '=', id).executeTakeFirst();
    return row?.bookId;
  }

  private async resolveActiveContextTarget(payload: SetContextInclusionPayload): Promise<{ bookId: string } | undefined> {
    if (!(await this.isActiveManuscriptPath(payload.entityType, payload.id))) return undefined;
    const bookId = await this.getBookIdForTarget(payload.entityType, payload.id);
    return bookId ? { bookId } : undefined;
  }

  private async isActiveManuscriptPath(mode: ManuscriptMode, id: string): Promise<boolean> {
    if (mode === 'book') return true;
    if (mode === 'act') {
      const row = await db.selectFrom('acts').select('status').where('id', '=', id).executeTakeFirst();
      return row?.status === 'active';
    }
    if (mode === 'chapter') {
      const row = await db.selectFrom('chapters').innerJoin('acts', 'acts.id', 'chapters.actId').select(['chapters.status as chapterStatus', 'acts.status as actStatus']).where('chapters.id', '=', id).executeTakeFirst();
      return row?.chapterStatus === 'active' && row.actStatus === 'active';
    }
    if (mode === 'scene') {
      const row = await db.selectFrom('scenes').innerJoin('chapters', 'chapters.id', 'scenes.chapterId').innerJoin('acts', 'acts.id', 'chapters.actId').select(['scenes.status as sceneStatus', 'chapters.status as chapterStatus', 'acts.status as actStatus']).where('scenes.id', '=', id).executeTakeFirst();
      return row?.sceneStatus === 'active' && row.chapterStatus === 'active' && row.actStatus === 'active';
    }
    return false;
  }

  private async touchBookLastEdited(mode: ManuscriptMode, id: string): Promise<void> {
    const bookId = await this.getBookIdForTarget(mode, id);
    if (bookId) await db.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', bookId).execute();
  }

  private async touchBookAfterStructureUpdate(payload: UpdateStructurePositionsPayload): Promise<void> {
    const actUpdate = payload.acts?.[0];
    if (actUpdate) return this.touchBookLastEdited('book', actUpdate.bookId);
    const chapterUpdate = payload.chapters?.[0];
    if (chapterUpdate) return this.touchBookLastEdited('act', chapterUpdate.actId);
    const sceneUpdate = payload.scenes?.[0];
    if (sceneUpdate) await this.touchBookLastEdited('chapter', sceneUpdate.chapterId);
  }
}

export const manuscriptRepository = new ManuscriptRepository();
