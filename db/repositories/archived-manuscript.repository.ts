import { and, eq, gt, inArray, isNull, max, or, sql } from 'drizzle-orm';

import { db } from '../index';
import { books } from '../schema/book';
import { act, chapter, scene } from '../schema/narrative';
import { ArchiveOverviewDto } from '../../shared/models/manuscript.model';

/**
 * Owns archive-specific manuscript reads and state transitions.
 *
 * Permanent deletion remains in ManuscriptRepository because the same delete
 * operations support both active and archived entities.
 */
export class ArchivedManuscriptRepository {
  /**
   * Returns archived entities grouped by their nearest active ancestor.
   * Descendants of an archived parent are included with that parent even for
   * legacy rows whose own status was not cascaded.
   */
  async getArchiveOverview(bookId: string): Promise<ArchiveOverviewDto> {
    const activeActRows = await db
      .select({ id: act.id, position: act.position })
      .from(act)
      .where(and(eq(act.bookId, bookId), eq(act.status, 'active')))
      .orderBy(act.position);
    const activeActIds = activeActRows.map(({ id }) => id);
    const activeActOrder = new Map(activeActIds.map((id, index) => [id, index]));

    const activeChapterRows =
      activeActIds.length > 0
        ? await db
            .select({
              id: chapter.id,
              actId: chapter.actId,
              position: chapter.position,
            })
            .from(chapter)
            .where(and(inArray(chapter.actId, activeActIds), eq(chapter.status, 'active')))
        : [];
    const activeChapterIds = activeChapterRows.map(({ id }) => id);
    const activeChapterOrder = new Map(
      [...activeChapterRows]
        .sort(
          (left, right) =>
            (left.actId === null
              ? Number.MAX_SAFE_INTEGER
              : (activeActOrder.get(left.actId) ?? 0)) -
              (right.actId === null
                ? Number.MAX_SAFE_INTEGER
                : (activeActOrder.get(right.actId) ?? 0)) || left.position - right.position,
        )
        .map(({ id }, index) => [id, index]),
    );

    const archivedActs = await db.query.act.findMany({
      where: and(eq(act.bookId, bookId), eq(act.status, 'archived')),
      columns: {
        id: true,
        title: true,
        bookId: true,
        position: true,
        status: true,
      },
      with: {
        chapters: {
          columns: {
            id: true,
            title: true,
            actId: true,
            archiveParentTitle: true,
            position: true,
            status: true,
          },
          orderBy: (chapters, { asc }) => [asc(chapters.position)],
          with: {
            scenes: {
              columns: {
                id: true,
                title: true,
                chapterId: true,
                archiveParentTitle: true,
                position: true,
                status: true,
              },
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        },
      },
      orderBy: (acts, { asc }) => [asc(acts.position)],
    });

    const archivedChapterParentFilter =
      activeActIds.length > 0
        ? or(isNull(chapter.actId), inArray(chapter.actId, activeActIds))
        : isNull(chapter.actId);
    const archivedChapters = await db.query.chapter.findMany({
      where: and(
        eq(chapter.bookId, bookId),
        eq(chapter.status, 'archived'),
        archivedChapterParentFilter,
      ),
      columns: {
        id: true,
        title: true,
        actId: true,
        archiveParentTitle: true,
        position: true,
        status: true,
      },
      with: {
        scenes: {
          columns: {
            id: true,
            title: true,
            chapterId: true,
            archiveParentTitle: true,
            position: true,
            status: true,
          },
          orderBy: (scenes, { asc }) => [asc(scenes.position)],
        },
      },
      orderBy: (chapters, { asc }) => [asc(chapters.position)],
    });

    const archivedSceneParentFilter =
      activeChapterIds.length > 0
        ? or(isNull(scene.chapterId), inArray(scene.chapterId, activeChapterIds))
        : isNull(scene.chapterId);
    const archivedScenes = await db.query.scene.findMany({
      where: and(eq(scene.bookId, bookId), eq(scene.status, 'archived'), archivedSceneParentFilter),
      columns: {
        id: true,
        title: true,
        chapterId: true,
        archiveParentTitle: true,
        position: true,
        status: true,
      },
      orderBy: (scenes, { asc }) => [asc(scenes.position)],
    });

    archivedChapters.sort(
      (left, right) =>
        (left.actId === null ? Number.MAX_SAFE_INTEGER : (activeActOrder.get(left.actId) ?? 0)) -
          (right.actId === null
            ? Number.MAX_SAFE_INTEGER
            : (activeActOrder.get(right.actId) ?? 0)) || left.position - right.position,
    );
    archivedScenes.sort(
      (left, right) =>
        (left.chapterId === null
          ? Number.MAX_SAFE_INTEGER
          : (activeChapterOrder.get(left.chapterId) ?? 0)) -
          (right.chapterId === null
            ? Number.MAX_SAFE_INTEGER
            : (activeChapterOrder.get(right.chapterId) ?? 0)) || left.position - right.position,
    );

    return {
      archivedActs,
      archivedChapters,
      archivedScenes,
    } as ArchiveOverviewDto;
  }

  async archiveAct(id: string): Promise<void> {
    const actToArchive = await db.query.act.findFirst({ where: eq(act.id, id) });

    if (!actToArchive || actToArchive.status === 'archived') {
      return;
    }

    const chapterRows = await db
      .select({ id: chapter.id, title: chapter.title })
      .from(chapter)
      .where(eq(chapter.actId, id));

    db.transaction((tx) => {
      tx.update(act).set({ status: 'archived' }).where(eq(act.id, id)).run();
      tx.update(chapter)
        .set({
          status: 'archived',
          archiveParentTitle: actToArchive.title,
        })
        .where(eq(chapter.actId, id))
        .run();

      for (const chapterRow of chapterRows) {
        tx.update(scene)
          .set({
            status: 'archived',
            archiveParentTitle: chapterRow.title,
          })
          .where(eq(scene.chapterId, chapterRow.id))
          .run();
      }

      tx.update(act)
        .set({ position: sql`${act.position} - 1` })
        .where(
          and(
            eq(act.bookId, actToArchive.bookId),
            eq(act.status, 'active'),
            gt(act.position, actToArchive.position),
          ),
        )
        .run();
      this.touchBook(tx, actToArchive.bookId);
    });
  }

  async archiveChapter(id: string): Promise<void> {
    const chapterToArchive = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });

    if (!chapterToArchive || chapterToArchive.status === 'archived') {
      return;
    }

    if (!chapterToArchive.actId) {
      throw new Error('The parent act for this chapter could not be found.');
    }
    const parentAct = await db.query.act.findFirst({ where: eq(act.id, chapterToArchive.actId) });
    if (!parentAct) {
      throw new Error('The parent act for this chapter could not be found.');
    }

    db.transaction((tx) => {
      tx.update(chapter)
        .set({
          status: 'archived',
          archiveParentTitle: parentAct.title,
        })
        .where(eq(chapter.id, id))
        .run();
      tx.update(scene)
        .set({
          status: 'archived',
          archiveParentTitle: chapterToArchive.title,
        })
        .where(eq(scene.chapterId, id))
        .run();
      tx.update(chapter)
        .set({ position: sql`${chapter.position} - 1` })
        .where(
          and(
            eq(chapter.actId, parentAct.id),
            eq(chapter.status, 'active'),
            gt(chapter.position, chapterToArchive.position),
          ),
        )
        .run();
      this.touchBook(tx, parentAct.bookId);
    });
  }

  async archiveScene(id: string): Promise<void> {
    const sceneToArchive = await db.query.scene.findFirst({
      where: eq(scene.id, id),
      with: { chapter: { with: { act: true } } },
    });

    if (!sceneToArchive || sceneToArchive.status === 'archived') {
      return;
    }

    const parentChapter = sceneToArchive.chapter;
    if (!parentChapter) {
      throw new Error('The parent chapter for this scene could not be found.');
    }

    db.transaction((tx) => {
      tx.update(scene)
        .set({
          status: 'archived',
          archiveParentTitle: parentChapter.title,
        })
        .where(eq(scene.id, id))
        .run();
      tx.update(scene)
        .set({ position: sql`${scene.position} - 1` })
        .where(
          and(
            eq(scene.chapterId, parentChapter.id),
            eq(scene.status, 'active'),
            gt(scene.position, sceneToArchive.position),
          ),
        )
        .run();
      this.touchBook(tx, sceneToArchive.bookId);
    });
  }

  async restoreAct(id: string): Promise<void> {
    const actToRestore = await db.query.act.findFirst({ where: eq(act.id, id) });

    if (!actToRestore) {
      throw new Error('The archived act could not be found.');
    }
    if (actToRestore.status === 'active') {
      return;
    }

    const [maxRow] = await db
      .select({ maxPos: max(act.position) })
      .from(act)
      .where(and(eq(act.bookId, actToRestore.bookId), eq(act.status, 'active')));
    const nextPosition = (maxRow?.maxPos ?? -1) + 1;
    const chapterRows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.actId, id));
    const chapterIds = chapterRows.map(({ id: chapterId }) => chapterId);

    db.transaction((tx) => {
      tx.update(act).set({ status: 'active', position: nextPosition }).where(eq(act.id, id)).run();
      tx.update(chapter)
        .set({ status: 'active', archiveParentTitle: null })
        .where(eq(chapter.actId, id))
        .run();

      if (chapterIds.length > 0) {
        tx.update(scene)
          .set({ status: 'active', archiveParentTitle: null })
          .where(inArray(scene.chapterId, chapterIds))
          .run();
      }

      this.touchBook(tx, actToRestore.bookId);
    });
  }

  async restoreChapter(id: string, targetActId: string): Promise<void> {
    const chapterToRestore = await db.query.chapter.findFirst({
      where: eq(chapter.id, id),
      with: { act: true },
    });
    const targetAct = await db.query.act.findFirst({ where: eq(act.id, targetActId) });

    if (!chapterToRestore) {
      throw new Error('The archived chapter could not be found.');
    }
    if (!targetAct || targetAct.status !== 'active') {
      throw new Error('Choose an active target act.');
    }
    if (chapterToRestore.bookId !== targetAct.bookId) {
      throw new Error('The target act belongs to a different book.');
    }
    if (chapterToRestore.status === 'active' && chapterToRestore.act?.status === 'active') {
      return;
    }

    const [maxRow] = await db
      .select({ maxPos: max(chapter.position) })
      .from(chapter)
      .where(and(eq(chapter.actId, targetActId), eq(chapter.status, 'active')));
    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    db.transaction((tx) => {
      tx.update(chapter)
        .set({
          actId: targetActId,
          position: nextPosition,
          status: 'active',
          archiveParentTitle: null,
        })
        .where(eq(chapter.id, id))
        .run();
      tx.update(scene)
        .set({ status: 'active', archiveParentTitle: null })
        .where(eq(scene.chapterId, id))
        .run();
      this.touchBook(tx, targetAct.bookId);
    });
  }

  async restoreScene(id: string, targetChapterId: string): Promise<void> {
    const sceneToRestore = await db.query.scene.findFirst({
      where: eq(scene.id, id),
      with: { chapter: { with: { act: true } } },
    });
    const targetChapter = await db.query.chapter.findFirst({
      where: eq(chapter.id, targetChapterId),
      with: { act: true },
    });

    if (!sceneToRestore) {
      throw new Error('The archived scene could not be found.');
    }
    if (
      !targetChapter?.act ||
      targetChapter.status !== 'active' ||
      targetChapter.act.status !== 'active'
    ) {
      throw new Error('Choose a chapter under an active act.');
    }
    if (sceneToRestore.bookId !== targetChapter.act.bookId) {
      throw new Error('The target chapter belongs to a different book.');
    }
    if (
      sceneToRestore.status === 'active' &&
      sceneToRestore.chapter?.status === 'active' &&
      sceneToRestore.chapter.act?.status === 'active'
    ) {
      return;
    }

    const [maxRow] = await db
      .select({ maxPos: max(scene.position) })
      .from(scene)
      .where(and(eq(scene.chapterId, targetChapterId), eq(scene.status, 'active')));
    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    db.transaction((tx) => {
      tx.update(scene)
        .set({
          chapterId: targetChapterId,
          position: nextPosition,
          status: 'active',
          archiveParentTitle: null,
        })
        .where(eq(scene.id, id))
        .run();
      this.touchBook(tx, targetChapter.act.bookId);
    });
  }

  private touchBook(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], bookId: string): void {
    tx.update(books).set({ lastEditedAt: new Date() }).where(eq(books.id, bookId)).run();
  }
}

export const archivedManuscriptRepository = new ArchivedManuscriptRepository();
