import { sql } from 'kysely';

import type {
  ArchiveActDto,
  ArchiveChapterDto,
  ArchiveOverviewDto,
  ArchiveSceneDto,
} from '../../shared/models/manuscript.model';
import { db, type DatabaseTransaction } from '../index';
import { toSqliteTimestamp } from '../core/sqlite-values';

export class ArchivedManuscriptRepository {
  async getArchiveOverview(bookId: string): Promise<ArchiveOverviewDto> {
    const activeActs = await db.selectFrom('acts').select(['id', 'position']).where('bookId', '=', bookId).where('status', '=', 'active').orderBy('position').execute();
    const activeActIds = activeActs.map(({ id }) => id);
    const activeActOrder = new Map(activeActIds.map((id, index) => [id, index]));
    const activeChapters = activeActIds.length > 0
      ? await db.selectFrom('chapters').select(['id', 'actId', 'position']).where('actId', 'in', activeActIds).where('status', '=', 'active').execute()
      : [];
    const activeChapterIds = activeChapters.map(({ id }) => id);
    const activeChapterOrder = new Map(
      [...activeChapters]
        .sort((left, right) =>
          (left.actId === null ? Number.MAX_SAFE_INTEGER : (activeActOrder.get(left.actId) ?? 0)) -
            (right.actId === null ? Number.MAX_SAFE_INTEGER : (activeActOrder.get(right.actId) ?? 0)) ||
          left.position - right.position,
        )
        .map(({ id }, index) => [id, index]),
    );

    const archivedActRows = await db.selectFrom('acts').select(['id', 'title', 'bookId', 'position', 'status']).where('bookId', '=', bookId).where('status', '=', 'archived').orderBy('position').execute();
    const archivedActIds = archivedActRows.map(({ id }) => id);
    const actChapterRows = archivedActIds.length > 0
      ? await db.selectFrom('chapters').select(['id', 'title', 'actId', 'archiveParentTitle', 'position', 'status']).where('actId', 'in', archivedActIds).orderBy('position').execute()
      : [];
    const actChapterIds = actChapterRows.map(({ id }) => id);
    const actSceneRows = actChapterIds.length > 0
      ? await db.selectFrom('scenes').select(['id', 'title', 'chapterId', 'archiveParentTitle', 'position', 'status']).where('chapterId', 'in', actChapterIds).orderBy('position').execute()
      : [];
    const actScenesByChapter = this.groupScenes(actSceneRows);
    const actChaptersByAct = new Map<string, ArchiveChapterDto[]>();
    for (const chapter of actChapterRows) {
      if (chapter.actId) {
        const rows = actChaptersByAct.get(chapter.actId) ?? [];
        rows.push({ ...chapter, scenes: actScenesByChapter.get(chapter.id) ?? [] });
        actChaptersByAct.set(chapter.actId, rows);
      }
    }
    const archivedActs: ArchiveActDto[] = archivedActRows.map((act) => ({
      ...act,
      chapters: actChaptersByAct.get(act.id) ?? [],
    }));

    let archivedChapterQuery = db.selectFrom('chapters').select(['id', 'title', 'actId', 'archiveParentTitle', 'position', 'status']).where('bookId', '=', bookId).where('status', '=', 'archived');
    archivedChapterQuery = activeActIds.length > 0
      ? archivedChapterQuery.where((expression) => expression.or([expression('actId', 'is', null), expression('actId', 'in', activeActIds)]))
      : archivedChapterQuery.where('actId', 'is', null);
    const archivedChapterRows = await archivedChapterQuery.orderBy('position').execute();
    const archivedChapterIds = archivedChapterRows.map(({ id }) => id);
    const chapterSceneRows = archivedChapterIds.length > 0
      ? await db.selectFrom('scenes').select(['id', 'title', 'chapterId', 'archiveParentTitle', 'position', 'status']).where('chapterId', 'in', archivedChapterIds).orderBy('position').execute()
      : [];
    const chapterScenes = this.groupScenes(chapterSceneRows);
    const archivedChapters: ArchiveChapterDto[] = archivedChapterRows.map((chapter) => ({
      ...chapter,
      scenes: chapterScenes.get(chapter.id) ?? [],
    }));

    let archivedSceneQuery = db.selectFrom('scenes').select(['id', 'title', 'chapterId', 'archiveParentTitle', 'position', 'status']).where('bookId', '=', bookId).where('status', '=', 'archived');
    archivedSceneQuery = activeChapterIds.length > 0
      ? archivedSceneQuery.where((expression) => expression.or([expression('chapterId', 'is', null), expression('chapterId', 'in', activeChapterIds)]))
      : archivedSceneQuery.where('chapterId', 'is', null);
    const archivedScenes = await archivedSceneQuery.orderBy('position').execute();

    archivedChapters.sort((left, right) =>
      (left.actId === null ? Number.MAX_SAFE_INTEGER : (activeActOrder.get(left.actId) ?? 0)) -
        (right.actId === null ? Number.MAX_SAFE_INTEGER : (activeActOrder.get(right.actId) ?? 0)) ||
      left.position - right.position,
    );
    archivedScenes.sort((left, right) =>
      (left.chapterId === null ? Number.MAX_SAFE_INTEGER : (activeChapterOrder.get(left.chapterId) ?? 0)) -
        (right.chapterId === null ? Number.MAX_SAFE_INTEGER : (activeChapterOrder.get(right.chapterId) ?? 0)) ||
      left.position - right.position,
    );
    return { archivedActs, archivedChapters, archivedScenes };
  }

  private groupScenes(rows: ArchiveSceneDto[]): Map<string, ArchiveSceneDto[]> {
    const grouped = new Map<string, ArchiveSceneDto[]>();
    for (const row of rows) {
      if (row.chapterId) {
        const scenes = grouped.get(row.chapterId) ?? [];
        scenes.push(row);
        grouped.set(row.chapterId, scenes);
      }
    }
    return grouped;
  }

  async archiveAct(id: string): Promise<void> {
    const target = await db.selectFrom('acts').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target || target.status === 'archived') return;
    const chapters = await db.selectFrom('chapters').select(['id', 'title']).where('actId', '=', id).execute();
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('acts').set({ status: 'archived' }).where('id', '=', id).execute();
      await transaction.updateTable('chapters').set({ status: 'archived', archiveParentTitle: target.title }).where('actId', '=', id).execute();
      for (const chapter of chapters) {
        await transaction.updateTable('scenes').set({ status: 'archived', archiveParentTitle: chapter.title }).where('chapterId', '=', chapter.id).execute();
      }
      await transaction.updateTable('acts').set({ position: sql`position - 1` }).where('bookId', '=', target.bookId).where('status', '=', 'active').where('position', '>', target.position).execute();
      await this.touchBook(transaction, target.bookId);
    });
  }

  async archiveChapter(id: string): Promise<void> {
    const target = await db.selectFrom('chapters').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target || target.status === 'archived') return;
    if (!target.actId) throw new Error('The parent act for this chapter could not be found.');
    const parent = await db.selectFrom('acts').selectAll().where('id', '=', target.actId).executeTakeFirst();
    if (!parent) throw new Error('The parent act for this chapter could not be found.');
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('chapters').set({ status: 'archived', archiveParentTitle: parent.title }).where('id', '=', id).execute();
      await transaction.updateTable('scenes').set({ status: 'archived', archiveParentTitle: target.title }).where('chapterId', '=', id).execute();
      await transaction.updateTable('chapters').set({ position: sql`position - 1` }).where('actId', '=', parent.id).where('status', '=', 'active').where('position', '>', target.position).execute();
      await this.touchBook(transaction, parent.bookId);
    });
  }

  async archiveScene(id: string): Promise<void> {
    const target = await db
      .selectFrom('scenes')
      .leftJoin('chapters', 'chapters.id', 'scenes.chapterId')
      .select(['scenes.id', 'scenes.bookId', 'scenes.position', 'scenes.status', 'chapters.id as parentId', 'chapters.title as parentTitle'])
      .where('scenes.id', '=', id)
      .executeTakeFirst();
    if (!target || target.status === 'archived') return;
    if (!target.parentId || target.parentTitle === null) throw new Error('The parent chapter for this scene could not be found.');
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('scenes').set({ status: 'archived', archiveParentTitle: target.parentTitle }).where('id', '=', id).execute();
      await transaction.updateTable('scenes').set({ position: sql`position - 1` }).where('chapterId', '=', target.parentId).where('status', '=', 'active').where('position', '>', target.position).execute();
      await this.touchBook(transaction, target.bookId);
    });
  }

  async restoreAct(id: string): Promise<void> {
    const target = await db.selectFrom('acts').selectAll().where('id', '=', id).executeTakeFirst();
    if (!target) throw new Error('The archived act could not be found.');
    if (target.status === 'active') return;
    const maxRow = await db.selectFrom('acts').select(sql<number | null>`max(position)`.as('maxPos')).where('bookId', '=', target.bookId).where('status', '=', 'active').executeTakeFirst();
    const chapters = await db.selectFrom('chapters').select('id').where('actId', '=', id).execute();
    const chapterIds = chapters.map(({ id }) => id);
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('acts').set({ status: 'active', position: (maxRow?.maxPos ?? -1) + 1 }).where('id', '=', id).execute();
      await transaction.updateTable('chapters').set({ status: 'active', archiveParentTitle: null }).where('actId', '=', id).execute();
      if (chapterIds.length > 0) await transaction.updateTable('scenes').set({ status: 'active', archiveParentTitle: null }).where('chapterId', 'in', chapterIds).execute();
      await this.touchBook(transaction, target.bookId);
    });
  }

  async restoreChapter(id: string, targetActId: string): Promise<void> {
    const chapter = await db
      .selectFrom('chapters')
      .leftJoin('acts as currentAct', 'currentAct.id', 'chapters.actId')
      .select(['chapters.id', 'chapters.bookId', 'chapters.status', 'currentAct.status as currentActStatus'])
      .where('chapters.id', '=', id)
      .executeTakeFirst();
    const target = await db.selectFrom('acts').selectAll().where('id', '=', targetActId).executeTakeFirst();
    if (!chapter) throw new Error('The archived chapter could not be found.');
    if (!target || target.status !== 'active') throw new Error('Choose an active target act.');
    if (chapter.bookId !== target.bookId) throw new Error('The target act belongs to a different book.');
    if (chapter.status === 'active' && chapter.currentActStatus === 'active') return;
    const maxRow = await db.selectFrom('chapters').select(sql<number | null>`max(position)`.as('maxPos')).where('actId', '=', targetActId).where('status', '=', 'active').executeTakeFirst();
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('chapters').set({ actId: targetActId, position: (maxRow?.maxPos ?? -1) + 1, status: 'active', archiveParentTitle: null }).where('id', '=', id).execute();
      await transaction.updateTable('scenes').set({ status: 'active', archiveParentTitle: null }).where('chapterId', '=', id).execute();
      await this.touchBook(transaction, target.bookId);
    });
  }

  async restoreScene(id: string, targetChapterId: string): Promise<void> {
    const scene = await db
      .selectFrom('scenes')
      .leftJoin('chapters as currentChapter', 'currentChapter.id', 'scenes.chapterId')
      .leftJoin('acts as currentAct', 'currentAct.id', 'currentChapter.actId')
      .select(['scenes.id', 'scenes.bookId', 'scenes.status', 'currentChapter.status as currentChapterStatus', 'currentAct.status as currentActStatus'])
      .where('scenes.id', '=', id)
      .executeTakeFirst();
    const target = await db
      .selectFrom('chapters')
      .innerJoin('acts', 'acts.id', 'chapters.actId')
      .select(['chapters.id', 'chapters.status', 'acts.status as actStatus', 'acts.bookId'])
      .where('chapters.id', '=', targetChapterId)
      .executeTakeFirst();
    if (!scene) throw new Error('The archived scene could not be found.');
    if (!target || target.status !== 'active' || target.actStatus !== 'active') throw new Error('Choose a chapter under an active act.');
    if (scene.bookId !== target.bookId) throw new Error('The target chapter belongs to a different book.');
    if (scene.status === 'active' && scene.currentChapterStatus === 'active' && scene.currentActStatus === 'active') return;
    const maxRow = await db.selectFrom('scenes').select(sql<number | null>`max(position)`.as('maxPos')).where('chapterId', '=', targetChapterId).where('status', '=', 'active').executeTakeFirst();
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('scenes').set({ chapterId: targetChapterId, position: (maxRow?.maxPos ?? -1) + 1, status: 'active', archiveParentTitle: null }).where('id', '=', id).execute();
      await this.touchBook(transaction, target.bookId);
    });
  }

  private async touchBook(transaction: DatabaseTransaction, bookId: string): Promise<void> {
    await transaction.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', bookId).execute();
  }
}

export const archivedManuscriptRepository = new ArchivedManuscriptRepository();
