import { and, eq, gt, inArray, max, sql } from 'drizzle-orm';

import { db } from '../index';
import { books } from '../schema/book';
import { act, chapter, scene } from '../schema/narrative';
import {
  ActDto,
  ChapterDto,
  ManuscriptDataDto,
  ManuscriptMode,
  SceneDto,
  TiptapJsonDoc,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
  UpdateStructurePositionsPayload,
  SetContextInclusionPayload,
} from '../../shared/models/manuscript.model';
import { withEffectiveContextInclusion } from '../../shared/utils/manuscript-context-inclusion';

export class ManuscriptRepository {
  // -----------------------------------------------------------------------
  // Manuscript reads
  // -----------------------------------------------------------------------

  async getManuscript(mode: ManuscriptMode, id: string): Promise<ManuscriptDataDto> {
    switch (mode) {
      case 'book': {
        const acts = await db.query.act.findMany({
          where: and(eq(act.bookId, id), eq(act.status, 'active')),
          with: {
            chapters: {
              where: eq(chapter.status, 'active'),
              orderBy: (chapters, { asc }) => [asc(chapters.position)],
              with: {
                scenes: {
                  where: eq(scene.status, 'active'),
                  orderBy: (scenes, { asc }) => [asc(scenes.position)],
                },
              },
            },
          },
          orderBy: (acts, { asc }) => [asc(acts.position)],
        });

        return acts as unknown as ActDto[];
      }

      case 'act': {
        const actData = await db.query.act.findFirst({
          where: and(eq(act.id, id), eq(act.status, 'active')),
          with: {
            chapters: {
              where: eq(chapter.status, 'active'),
              orderBy: (chapters, { asc }) => [asc(chapters.position)],
              with: {
                scenes: {
                  where: eq(scene.status, 'active'),
                  orderBy: (scenes, { asc }) => [asc(scenes.position)],
                },
              },
            },
          },
        });

        return actData as unknown as ActDto;
      }

      case 'chapter': {
        const isVisible = await this.isActiveManuscriptPath('chapter', id);
        if (!isVisible) return undefined as unknown as ChapterDto;

        const chapterData = await db.query.chapter.findFirst({
          where: and(eq(chapter.id, id), eq(chapter.status, 'active')),
          with: {
            scenes: {
              where: eq(scene.status, 'active'),
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        });

        return chapterData as unknown as ChapterDto;
      }

      case 'scene': {
        const isVisible = await this.isActiveManuscriptPath('scene', id);
        if (!isVisible) return undefined as unknown as SceneDto;

        const sceneData = await db.query.scene.findFirst({
          where: and(eq(scene.id, id), eq(scene.status, 'active')),
        });

        return sceneData as unknown as SceneDto;
      }

      default:
        throw new Error('Invalid manuscript mode');
    }
  }

  /**
   * Fetches prose JSON for a batch of scenes.
   * Used by lazy-loading UI code to hydrate visible scene skeletons.
   */
  async getScenesProse(sceneIds: string[]): Promise<Record<string, TiptapJsonDoc | null>> {
    if (sceneIds.length === 0) {
      return {};
    }

    const rows = await db.query.scene.findMany({
      where: (scenes, { inArray }) => inArray(scenes.id, sceneIds),
      columns: { id: true, prose: true },
    });

    const result: Record<string, TiptapJsonDoc | null> = {};

    for (const row of rows) {
      result[row.id] = row.prose ?? null;
    }

    return result;
  }

  /**
   * Fetches the book structure without heavy prose/summary payloads.
   * Used for navigation trees and other lightweight hierarchy views.
   */
  async getBookHierarchy(mode: ManuscriptMode, id: string): Promise<ActDto[]> {
    const bookId = await this.resolveBookId(mode, id);

    if (!bookId) {
      return [];
    }

    const acts = await db.query.act.findMany({
      where: and(eq(act.bookId, bookId), eq(act.status, 'active')),
      columns: { summary: false },
      with: {
        chapters: {
          where: eq(chapter.status, 'active'),
          columns: { summary: false },
          orderBy: (chapters, { asc }) => [asc(chapters.position)],
          with: {
            scenes: {
              where: eq(scene.status, 'active'),
              columns: { prose: false },
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        },
      },
      orderBy: (acts, { asc }) => [asc(acts.position)],
    });

    // Prose remains omitted. Scene summaries are retained so effective
    // inclusion can distinguish summary-only scenes from empty scenes.
    return withEffectiveContextInclusion(acts as unknown as ActDto[]);
  }

  /**
   * Fetches the outline tree with summaries for the outline screen, while
   * still excluding heavy scene prose payloads.
   */
  async getOutline(bookId: string): Promise<ActDto[]> {
    const acts = await db.query.act.findMany({
      where: and(eq(act.bookId, bookId), eq(act.status, 'active')),
      with: {
        chapters: {
          where: eq(chapter.status, 'active'),
          orderBy: (chapters, { asc }) => [asc(chapters.position)],
          with: {
            scenes: {
              where: eq(scene.status, 'active'),
              columns: { prose: false },
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        },
      },
      orderBy: (acts, { asc }) => [asc(acts.position)],
    });

    return withEffectiveContextInclusion(acts as unknown as ActDto[]);
  }

  async setContextInclusion(payload: SetContextInclusionPayload): Promise<ActDto[]> {
    const target = await this.resolveActiveContextTarget(payload);
    if (!target) {
      throw new Error(`The active ${payload.entityType} could not be found.`);
    }

    db.transaction((tx) => {
      if (payload.entityType === 'scene') {
        tx.update(scene)
          .set({ includeInContext: payload.included })
          .where(and(eq(scene.id, payload.id), eq(scene.status, 'active')))
          .run();
        return;
      }

      if (payload.entityType === 'chapter') {
        tx.update(scene)
          .set({ includeInContext: payload.included })
          .where(and(eq(scene.chapterId, payload.id), eq(scene.status, 'active')))
          .run();
        return;
      }

      const chapterIds = tx.select({ id: chapter.id })
        .from(chapter)
        .where(and(eq(chapter.actId, payload.id), eq(chapter.status, 'active')))
        .all()
        .map((row) => row.id);
      if (chapterIds.length > 0) {
        tx.update(scene)
          .set({ includeInContext: payload.included })
          .where(and(inArray(scene.chapterId, chapterIds), eq(scene.status, 'active')))
          .run();
      }
    });

    return this.getOutline(target.bookId);
  }

  // -----------------------------------------------------------------------
  // Create methods
  // -----------------------------------------------------------------------

  async createAct(bookId: string): Promise<ActDto> {
    const [maxRow] = await db
      .select({ maxPos: max(act.position) })
      .from(act)
      .where(and(eq(act.bookId, bookId), eq(act.status, 'active')));

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(act)
      .values({ title: '', bookId, position: nextPosition })
      .returning();

    await this.touchBookLastEdited('book', bookId);
    return inserted as unknown as ActDto;
  }

  async createChapter(actId: string): Promise<ChapterDto> {
    this.assertActiveParentId('chapter', actId);
    const parentAct = await db.query.act.findFirst({ where: eq(act.id, actId) });
    if (!parentAct) {
      throw new Error('The parent act for this chapter could not be found.');
    }

    const [maxRow] = await db
      .select({ maxPos: max(chapter.position) })
      .from(chapter)
      .where(and(eq(chapter.actId, actId), eq(chapter.status, 'active')));

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(chapter)
      .values({ title: '', bookId: parentAct.bookId, actId, position: nextPosition })
      .returning();

    await this.touchBookLastEdited('act', actId);
    return inserted as unknown as ChapterDto;
  }

  async createScene(chapterId: string): Promise<SceneDto> {
    this.assertActiveParentId('scene', chapterId);
    const parentChapter = await db.query.chapter.findFirst({ where: eq(chapter.id, chapterId) });
    if (!parentChapter) {
      throw new Error('The parent chapter for this scene could not be found.');
    }

    const [maxRow] = await db
      .select({ maxPos: max(scene.position) })
      .from(scene)
      .where(and(eq(scene.chapterId, chapterId), eq(scene.status, 'active')));

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(scene)
      .values({ title: '', bookId: parentChapter.bookId, chapterId, position: nextPosition })
      .returning();

    await this.touchBookLastEdited('chapter', chapterId);
    return inserted as unknown as SceneDto;
  }

  // -----------------------------------------------------------------------
  // Update methods
  // -----------------------------------------------------------------------

  async updateAct(payload: UpdateActPayload): Promise<ActDto> {
    const { id, ...data } = payload;
    const [updated] = await db.update(act).set(data).where(eq(act.id, id)).returning();

    if (updated) {
      await this.touchBookLastEdited('book', updated.bookId);
    }

    return updated as unknown as ActDto;
  }

  async updateChapter(payload: UpdateChapterPayload): Promise<ChapterDto> {
    const { id, ...data } = payload;
    const [updated] = await db.update(chapter).set(data).where(eq(chapter.id, id)).returning();

    if (updated) {
      await this.touchBookLastEdited('book', updated.bookId);
    }

    return updated as unknown as ChapterDto;
  }

  async updateScene(payload: UpdateScenePayload): Promise<SceneDto> {
    const { id, ...data } = payload;
    const [updated] = await db.update(scene).set(data).where(eq(scene.id, id)).returning();

    if (updated) {
      await this.touchBookLastEdited('book', updated.bookId);
    }

    return updated as unknown as SceneDto;
  }

  // -----------------------------------------------------------------------
  // Structure position methods
  // -----------------------------------------------------------------------

  async updateStructurePositions(payload: UpdateStructurePositionsPayload): Promise<void> {
    for (const item of payload.chapters ?? []) {
      this.assertActiveParentId('chapter', item.actId);
    }
    for (const item of payload.scenes ?? []) {
      this.assertActiveParentId('scene', item.chapterId);
    }

    db.transaction(tx => {
      for (const item of payload.acts ?? []) {
        tx
          .update(act)
          .set({ position: item.position })
          .where(and(eq(act.id, item.id), eq(act.bookId, item.bookId), eq(act.status, 'active')))
          .run();
      }

      for (const item of payload.chapters ?? []) {
        tx
          .update(chapter)
          .set({ actId: item.actId, position: item.position })
          .where(and(eq(chapter.id, item.id), eq(chapter.status, 'active')))
          .run();
      }

      for (const item of payload.scenes ?? []) {
        tx
          .update(scene)
          .set({ chapterId: item.chapterId, position: item.position })
          .where(and(eq(scene.id, item.id), eq(scene.status, 'active')))
          .run();
      }
    });

    await this.touchBookAfterStructureUpdate(payload);
  }

  // -----------------------------------------------------------------------
  // Delete methods
  // Active-parent deletion preserves archived descendants. Archived-parent
  // deletion remains a permanent subtree deletion.
  // -----------------------------------------------------------------------

  async deleteAct(id: string): Promise<void> {
    const actToDelete = await db.query.act.findFirst({ where: eq(act.id, id) });

    if (!actToDelete) {
      return;
    }

    const chapterRows = await db
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.actId, id));
    const chapterIds = chapterRows.map(({ id: chapterId }) => chapterId);

    db.transaction((tx) => {
      if (chapterIds.length > 0) {
        tx
          .delete(scene)
          .where(
            actToDelete.status === 'archived'
              ? inArray(scene.chapterId, chapterIds)
              : and(inArray(scene.chapterId, chapterIds), eq(scene.status, 'active')),
          )
          .run();
      }

      tx
        .delete(chapter)
        .where(
          actToDelete.status === 'archived'
            ? eq(chapter.actId, id)
            : and(eq(chapter.actId, id), eq(chapter.status, 'active')),
        )
        .run();
      tx.delete(act).where(eq(act.id, id)).run();

      if (actToDelete.status === 'active') {
        tx
          .update(act)
          .set({ position: sql`${act.position} - 1` })
          .where(
            and(
              eq(act.bookId, actToDelete.bookId),
              eq(act.status, 'active'),
              gt(act.position, actToDelete.position),
            ),
          )
          .run();
      }

      tx
        .update(books)
        .set({ lastEditedAt: new Date() })
        .where(eq(books.id, actToDelete.bookId))
        .run();
    });
  }

  async deleteChapter(id: string): Promise<void> {
    const chapterToDelete = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });

    if (!chapterToDelete) {
      return;
    }

    db.transaction((tx) => {
      tx
        .delete(scene)
        .where(
          chapterToDelete.status === 'archived'
            ? eq(scene.chapterId, id)
            : and(eq(scene.chapterId, id), eq(scene.status, 'active')),
        )
        .run();
      tx.delete(chapter).where(eq(chapter.id, id)).run();

      if (chapterToDelete.status === 'active' && chapterToDelete.actId) {
        tx
          .update(chapter)
          .set({ position: sql`${chapter.position} - 1` })
          .where(
            and(
              eq(chapter.actId, chapterToDelete.actId),
              eq(chapter.status, 'active'),
              gt(chapter.position, chapterToDelete.position),
            ),
          )
          .run();
      }

      tx
        .update(books)
        .set({ lastEditedAt: new Date() })
        .where(eq(books.id, chapterToDelete.bookId))
        .run();
    });
  }

  async deleteScene(id: string): Promise<void> {
    const sceneToDelete = await db.query.scene.findFirst({ where: eq(scene.id, id) });

    if (!sceneToDelete) {
      return;
    }

    db.transaction((tx) => {
      tx.delete(scene).where(eq(scene.id, id)).run();

      if (sceneToDelete.status === 'active' && sceneToDelete.chapterId) {
        tx
          .update(scene)
          .set({ position: sql`${scene.position} - 1` })
          .where(
            and(
              eq(scene.chapterId, sceneToDelete.chapterId),
              eq(scene.status, 'active'),
              gt(scene.position, sceneToDelete.position),
            ),
          )
          .run();
      }

      tx
        .update(books)
        .set({ lastEditedAt: new Date() })
        .where(eq(books.id, sceneToDelete.bookId))
        .run();
    });
  }

  // -----------------------------------------------------------------------
  // Aggregate reads
  // -----------------------------------------------------------------------

  /**
   * Calculates scene word counts at the requested hierarchy level.
   */
  async getWordCount(mode: ManuscriptMode, id: string): Promise<number> {
    switch (mode) {
      case 'scene': {
        const [result] = await db
          .select({ wordCount: scene.wordCount })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .innerJoin(act, eq(chapter.actId, act.id))
          .where(
            and(
              eq(scene.id, id),
              eq(scene.status, 'active'),
              eq(chapter.status, 'active'),
              eq(act.status, 'active'),
            ),
          );

        return result?.wordCount ?? 0;
      }

      case 'chapter': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .innerJoin(act, eq(chapter.actId, act.id))
          .where(
            and(
              eq(scene.chapterId, id),
              eq(scene.status, 'active'),
              eq(chapter.status, 'active'),
              eq(act.status, 'active'),
            ),
          );

        return Number(result?.sum ?? 0);
      }

      case 'act': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .innerJoin(act, eq(chapter.actId, act.id))
          .where(
            and(
              eq(chapter.actId, id),
              eq(scene.status, 'active'),
              eq(chapter.status, 'active'),
              eq(act.status, 'active'),
            ),
          );

        return Number(result?.sum ?? 0);
      }

      case 'book': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .innerJoin(act, eq(chapter.actId, act.id))
          .where(
            and(
              eq(act.bookId, id),
              eq(scene.status, 'active'),
              eq(chapter.status, 'active'),
              eq(act.status, 'active'),
            ),
          );

        return Number(result?.sum ?? 0);
      }

      default:
        return 0;
    }
  }

  /**
   * Counts all chapters belonging to a specific book.
   */
  async getChapterCount(bookId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(${chapter.id})` })
      .from(chapter)
      .innerJoin(act, eq(chapter.actId, act.id))
      .where(
        and(
          eq(act.bookId, bookId),
          eq(act.status, 'active'),
          eq(chapter.status, 'active'),
        ),
      );

    return Number(result?.count ?? 0);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private assertActiveParentId(
    entity: 'chapter' | 'scene',
    parentId: string | null | undefined,
  ): void {
    if (!parentId) {
      const parent = entity === 'chapter' ? 'act' : 'chapter';
      throw new Error(`An active ${entity} must have a parent ${parent}.`);
    }
  }

  private async resolveBookId(mode: ManuscriptMode, id: string): Promise<string | undefined> {
    switch (mode) {
      case 'book':
        return id;

      case 'act': {
        const actData = await db.query.act.findFirst({ where: eq(act.id, id) });
        return actData?.bookId;
      }

      case 'chapter': {
        const chapterData = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });
        return chapterData?.bookId;
      }

      case 'scene': {
        const sceneData = await db.query.scene.findFirst({ where: eq(scene.id, id) });
        return sceneData?.bookId;
      }

      default:
        return undefined;
    }
  }

  private async resolveActiveContextTarget(
    payload: SetContextInclusionPayload,
  ): Promise<{ bookId: string } | undefined> {
    const isActive = await this.isActiveManuscriptPath(payload.entityType, payload.id);
    if (!isActive) return undefined;

    const bookId = await this.resolveBookId(payload.entityType, payload.id);
    return bookId ? { bookId } : undefined;
  }

  private async isActiveManuscriptPath(mode: ManuscriptMode, id: string): Promise<boolean> {
    switch (mode) {
      case 'book':
        return true;

      case 'act': {
        const actData = await db.query.act.findFirst({ where: eq(act.id, id) });
        return actData?.status === 'active';
      }

      case 'chapter': {
        const chapterData = await db.query.chapter.findFirst({
          where: eq(chapter.id, id),
          with: { act: true },
        });

        return chapterData?.status === 'active' && chapterData.act?.status === 'active';
      }

      case 'scene': {
        const sceneData = await db.query.scene.findFirst({
          where: eq(scene.id, id),
          with: { chapter: { with: { act: true } } },
        });

        return (
          sceneData?.status === 'active'
          && sceneData.chapter?.status === 'active'
          && sceneData.chapter?.act?.status === 'active'
        );
      }

      default:
        return false;
    }
  }

  private async touchBookLastEdited(mode: ManuscriptMode, id: string): Promise<void> {
    const bookId = await this.resolveBookId(mode, id);

    if (!bookId) {
      return;
    }

    await db.update(books).set({ lastEditedAt: new Date() }).where(eq(books.id, bookId));
  }

  private async touchBookAfterStructureUpdate(payload: UpdateStructurePositionsPayload): Promise<void> {
    const actUpdate = payload.acts?.[0];
    if (actUpdate) {
      await this.touchBookLastEdited('book', actUpdate.bookId);
      return;
    }

    const chapterUpdate = payload.chapters?.[0];
    if (chapterUpdate) {
      await this.touchBookLastEdited('act', chapterUpdate.actId);
      return;
    }

    const sceneUpdate = payload.scenes?.[0];
    if (sceneUpdate) {
      await this.touchBookLastEdited('chapter', sceneUpdate.chapterId);
    }
  }
}

export const manuscriptRepository = new ManuscriptRepository();
