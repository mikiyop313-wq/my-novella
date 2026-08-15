import { and, eq, gt, max, sql } from 'drizzle-orm';

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
} from '../../shared/models/manuscript.model';

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
              columns: { prose: false, summary: false },
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        },
      },
      orderBy: (acts, { asc }) => [asc(acts.position)],
    });

    // The omitted fields are intentionally absent over IPC for this
    // lightweight tree, even though the frontend DTO includes them.
    return acts as unknown as ActDto[];
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

    return acts as unknown as ActDto[];
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
      .values({ title: 'New Act', bookId, position: nextPosition })
      .returning();

    await this.touchBookLastEdited('book', bookId);
    return inserted as unknown as ActDto;
  }

  async createChapter(actId: string): Promise<ChapterDto> {
    const [maxRow] = await db
      .select({ maxPos: max(chapter.position) })
      .from(chapter)
      .where(and(eq(chapter.actId, actId), eq(chapter.status, 'active')));

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(chapter)
      .values({ title: 'New Chapter', actId, position: nextPosition })
      .returning();

    await this.touchBookLastEdited('act', actId);
    return inserted as unknown as ChapterDto;
  }

  async createScene(chapterId: string): Promise<SceneDto> {
    const [maxRow] = await db
      .select({ maxPos: max(scene.position) })
      .from(scene)
      .where(and(eq(scene.chapterId, chapterId), eq(scene.status, 'active')));

    const nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(scene)
      .values({ title: '', chapterId, position: nextPosition })
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
      await this.touchBookLastEdited('act', updated.actId);
    }

    return updated as unknown as ChapterDto;
  }

  async updateScene(payload: UpdateScenePayload): Promise<SceneDto> {
    const { id, ...data } = payload;
    const [updated] = await db.update(scene).set(data).where(eq(scene.id, id)).returning();

    if (updated) {
      await this.touchBookLastEdited('chapter', updated.chapterId);
    }

    return updated as unknown as SceneDto;
  }

  // -----------------------------------------------------------------------
  // Structure position methods
  // -----------------------------------------------------------------------

  async updateStructurePositions(payload: UpdateStructurePositionsPayload): Promise<void> {
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
  // Cascade rules are defined in the schema with onDelete: 'cascade'.
  // -----------------------------------------------------------------------

  async deleteAct(id: string): Promise<void> {
    const actToDelete = await db.query.act.findFirst({ where: eq(act.id, id) });

    if (!actToDelete) {
      return;
    }

    await this.touchBookLastEdited('act', id);
    await db.delete(act).where(eq(act.id, id));

    if (actToDelete.status === 'active') {
      await db
        .update(act)
        .set({ position: sql`${act.position} - 1` })
        .where(
          and(
            eq(act.bookId, actToDelete.bookId),
            eq(act.status, 'active'),
            gt(act.position, actToDelete.position),
          ),
        );
    }
  }

  async deleteChapter(id: string): Promise<void> {
    const chapterToDelete = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });

    if (!chapterToDelete) {
      return;
    }

    await this.touchBookLastEdited('chapter', id);
    await db.delete(chapter).where(eq(chapter.id, id));

    if (chapterToDelete.status === 'active') {
      await db
        .update(chapter)
        .set({ position: sql`${chapter.position} - 1` })
        .where(
          and(
            eq(chapter.actId, chapterToDelete.actId),
            eq(chapter.status, 'active'),
            gt(chapter.position, chapterToDelete.position),
          ),
        );
    }
  }

  async deleteScene(id: string): Promise<void> {
    const sceneToDelete = await db.query.scene.findFirst({ where: eq(scene.id, id) });

    if (!sceneToDelete) {
      return;
    }

    await this.touchBookLastEdited('scene', id);
    await db.delete(scene).where(eq(scene.id, id));

    if (sceneToDelete.status === 'active') {
      await db
        .update(scene)
        .set({ position: sql`${scene.position} - 1` })
        .where(
          and(
            eq(scene.chapterId, sceneToDelete.chapterId),
            eq(scene.status, 'active'),
            gt(scene.position, sceneToDelete.position),
          ),
        );
    }
  }

  // -----------------------------------------------------------------------
  // Archive methods
  // Archived rows are hidden from normal hierarchy/manuscript reads but kept
  // in place so their nested data can be restored by a future UI.
  // -----------------------------------------------------------------------

  async archiveAct(id: string): Promise<void> {
    const actToArchive = await db.query.act.findFirst({ where: eq(act.id, id) });

    if (!actToArchive || actToArchive.status === 'archived') {
      return;
    }

    await this.touchBookLastEdited('act', id);
    await db.update(act).set({ status: 'archived' }).where(eq(act.id, id));

    await db
      .update(act)
      .set({ position: sql`${act.position} - 1` })
      .where(
        and(
          eq(act.bookId, actToArchive.bookId),
          eq(act.status, 'active'),
          gt(act.position, actToArchive.position),
        ),
      );
  }

  async archiveChapter(id: string): Promise<void> {
    const chapterToArchive = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });

    if (!chapterToArchive || chapterToArchive.status === 'archived') {
      return;
    }

    await this.touchBookLastEdited('chapter', id);
    await db.update(chapter).set({ status: 'archived' }).where(eq(chapter.id, id));

    await db
      .update(chapter)
      .set({ position: sql`${chapter.position} - 1` })
      .where(
        and(
          eq(chapter.actId, chapterToArchive.actId),
          eq(chapter.status, 'active'),
          gt(chapter.position, chapterToArchive.position),
        ),
      );
  }

  async archiveScene(id: string): Promise<void> {
    const sceneToArchive = await db.query.scene.findFirst({ where: eq(scene.id, id) });

    if (!sceneToArchive || sceneToArchive.status === 'archived') {
      return;
    }

    await this.touchBookLastEdited('scene', id);
    await db.update(scene).set({ status: 'archived' }).where(eq(scene.id, id));

    await db
      .update(scene)
      .set({ position: sql`${scene.position} - 1` })
      .where(
        and(
          eq(scene.chapterId, sceneToArchive.chapterId),
          eq(scene.status, 'active'),
          gt(scene.position, sceneToArchive.position),
        ),
      );
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

  private async resolveBookId(mode: ManuscriptMode, id: string): Promise<string | undefined> {
    switch (mode) {
      case 'book':
        return id;

      case 'act': {
        const actData = await db.query.act.findFirst({ where: eq(act.id, id) });
        return actData?.bookId;
      }

      case 'chapter': {
        const chapterData = await db.query.chapter.findFirst({
          where: eq(chapter.id, id),
          with: { act: true },
        });

        return chapterData?.act?.bookId;
      }

      case 'scene': {
        const sceneData = await db.query.scene.findFirst({
          where: eq(scene.id, id),
          with: { chapter: { with: { act: true } } },
        });

        return sceneData?.chapter?.act?.bookId;
      }

      default:
        return undefined;
    }
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
