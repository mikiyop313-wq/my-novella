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
} from '../../shared/models/manuscript.model';

export class ManuscriptRepository {
  // -----------------------------------------------------------------------
  // Manuscript reads
  // -----------------------------------------------------------------------

  async getManuscript(mode: ManuscriptMode, id: string): Promise<ManuscriptDataDto> {
    switch (mode) {
      case 'book': {
        const acts = await db.query.act.findMany({
          where: eq(act.bookId, id),
          with: {
            chapters: {
              orderBy: (chapters, { asc }) => [asc(chapters.position)],
              with: {
                scenes: {
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
          where: eq(act.id, id),
          with: {
            chapters: {
              orderBy: (chapters, { asc }) => [asc(chapters.position)],
              with: {
                scenes: {
                  orderBy: (scenes, { asc }) => [asc(scenes.position)],
                },
              },
            },
          },
        });

        return actData as unknown as ActDto;
      }

      case 'chapter': {
        const chapterData = await db.query.chapter.findFirst({
          where: eq(chapter.id, id),
          with: {
            scenes: {
              orderBy: (scenes, { asc }) => [asc(scenes.position)],
            },
          },
        });

        return chapterData as unknown as ChapterDto;
      }

      case 'scene': {
        const sceneData = await db.query.scene.findFirst({
          where: eq(scene.id, id),
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
      where: eq(act.bookId, bookId),
      columns: { summary: false },
      with: {
        chapters: {
          columns: { summary: false },
          orderBy: (chapters, { asc }) => [asc(chapters.position)],
          with: {
            scenes: {
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

  // -----------------------------------------------------------------------
  // Create methods
  // -----------------------------------------------------------------------

  async createAct(bookId: string): Promise<ActDto> {
    const [maxRow] = await db
      .select({ maxPos: max(act.position) })
      .from(act)
      .where(eq(act.bookId, bookId));

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
      .where(eq(chapter.actId, actId));

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
      .where(eq(scene.chapterId, chapterId));

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

    await db
      .update(act)
      .set({ position: sql`${act.position} - 1` })
      .where(and(eq(act.bookId, actToDelete.bookId), gt(act.position, actToDelete.position)));
  }

  async deleteChapter(id: string): Promise<void> {
    const chapterToDelete = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });

    if (!chapterToDelete) {
      return;
    }

    await this.touchBookLastEdited('chapter', id);
    await db.delete(chapter).where(eq(chapter.id, id));

    await db
      .update(chapter)
      .set({ position: sql`${chapter.position} - 1` })
      .where(
        and(
          eq(chapter.actId, chapterToDelete.actId),
          gt(chapter.position, chapterToDelete.position),
        ),
      );
  }

  async deleteScene(id: string): Promise<void> {
    const sceneToDelete = await db.query.scene.findFirst({ where: eq(scene.id, id) });

    if (!sceneToDelete) {
      return;
    }

    await this.touchBookLastEdited('scene', id);
    await db.delete(scene).where(eq(scene.id, id));

    await db
      .update(scene)
      .set({ position: sql`${scene.position} - 1` })
      .where(
        and(
          eq(scene.chapterId, sceneToDelete.chapterId),
          gt(scene.position, sceneToDelete.position),
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
          .where(eq(scene.id, id));

        return result?.wordCount ?? 0;
      }

      case 'chapter': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .where(eq(scene.chapterId, id));

        return Number(result?.sum ?? 0);
      }

      case 'act': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .where(eq(chapter.actId, id));

        return Number(result?.sum ?? 0);
      }

      case 'book': {
        const [result] = await db
          .select({ sum: sql<number>`sum(coalesce(${scene.wordCount}, 0))` })
          .from(scene)
          .innerJoin(chapter, eq(scene.chapterId, chapter.id))
          .innerJoin(act, eq(chapter.actId, act.id))
          .where(eq(act.bookId, id));

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
      .where(eq(act.bookId, bookId));

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

  private async touchBookLastEdited(mode: ManuscriptMode, id: string): Promise<void> {
    const bookId = await this.resolveBookId(mode, id);

    if (!bookId) {
      return;
    }

    await db.update(books).set({ lastEditedAt: new Date() }).where(eq(books.id, bookId));
  }
}

export const manuscriptRepository = new ManuscriptRepository();
