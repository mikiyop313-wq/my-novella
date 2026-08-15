import { db } from '../index';
import { act, chapter, scene } from '../schema/narrative';
import { books } from '../schema/book';
import { eq, max, and, gt, sql } from 'drizzle-orm';
import { ActDto, ChapterDto, SceneDto, ManuscriptDataDto, UpdateActPayload, UpdateChapterPayload, UpdateScenePayload } from '../../shared/models/manuscript.model';

export class ManuscriptRepository {
    async getManuscript(mode: 'book' | 'act' | 'chapter' | 'scene', id: string): Promise<ManuscriptDataDto> {
        switch (mode) {
            case 'book': {
                const acts = await db.query.act.findMany({
                    where: eq(act.bookId, id),
                    with: {
                        chapters: {
                            orderBy: (chapters, { asc }) => [asc(chapters.position)],
                            with: {
                                scenes: {
                                    orderBy: (scenes, { asc }) => [asc(scenes.position)]
                                }
                            }
                        }
                    },
                    orderBy: (acts, { asc }) => [asc(acts.position)]
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
                                    orderBy: (scenes, { asc }) => [asc(scenes.position)]
                                }
                            }
                        }
                    }
                });
                return actData as unknown as ActDto;
            }
            case 'chapter': {
                const chapterData = await db.query.chapter.findFirst({
                    where: eq(chapter.id, id),
                    with: {
                        scenes: {
                            orderBy: (scenes, { asc }) => [asc(scenes.position)]
                        }
                    }
                });
                return chapterData as unknown as ChapterDto;
            }
            case 'scene': {
                const sceneData = await db.query.scene.findFirst({
                    where: eq(scene.id, id)
                });
                return sceneData as unknown as SceneDto;
            }
            default:
                throw new Error('Invalid mode');
        }
    }

    private async touchBookLastEdited(id: string, type: 'book' | 'act' | 'chapter' | 'scene'): Promise<void> {
        let bookId: string | undefined;

        if (type === 'book') {
            bookId = id;
        } else if (type === 'act') {
            const a = await db.query.act.findFirst({ where: eq(act.id, id) });
            bookId = a?.bookId;
        } else if (type === 'chapter') {
            const c = await db.query.chapter.findFirst({
                where: eq(chapter.id, id),
                with: { act: true }
            });
            bookId = c?.act?.bookId;
        } else if (type === 'scene') {
            const s = await db.query.scene.findFirst({
                where: eq(scene.id, id),
                with: { chapter: { with: { act: true } } }
            });
            bookId = s?.chapter?.act?.bookId;
        }

        if (bookId) {
            await db.update(books).set({ lastEditedAt: new Date() }).where(eq(books.id, bookId));
        }
    }

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

        await this.touchBookLastEdited(bookId, 'book');
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

        await this.touchBookLastEdited(actId, 'act');
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

        await this.touchBookLastEdited(chapterId, 'chapter');
        return inserted as unknown as SceneDto;
    }


    // -----------------------------------------------------------------------
    // Update methods
    // -----------------------------------------------------------------------

    async updateAct(payload: UpdateActPayload): Promise<ActDto> {
        const { id, ...data } = payload;
        const [updated] = await db
            .update(act)
            .set(data)
            .where(eq(act.id, id))
            .returning();

        if (updated) {
            await this.touchBookLastEdited(updated.bookId, 'book');
        }
        return updated as unknown as ActDto;
    }

    async updateChapter(payload: UpdateChapterPayload): Promise<ChapterDto> {
        const { id, ...data } = payload;
        const [updated] = await db
            .update(chapter)
            .set(data)
            .where(eq(chapter.id, id))
            .returning();

        if (updated) {
            await this.touchBookLastEdited(updated.actId, 'act');
        }
        return updated as unknown as ChapterDto;
    }

    async updateScene(payload: UpdateScenePayload): Promise<SceneDto> {
        const { id, ...data } = payload;
        const [updated] = await db
            .update(scene)
            .set(data)
            .where(eq(scene.id, id))
            .returning();

        if (updated) {
            await this.touchBookLastEdited(updated.chapterId, 'chapter');
        }
        return updated as unknown as SceneDto;
    }

    // -----------------------------------------------------------------------
    // Delete methods
    // Cascade rules (defined in schema with onDelete: 'cascade'):
    //   deleteAct     → also deletes all chapters and scenes within the act
    //   deleteChapter → also deletes all scenes within the chapter
    //   deleteScene   → deletes only the scene
    // -----------------------------------------------------------------------

    async deleteAct(id: string): Promise<void> {
        const actToDelete = await db.query.act.findFirst({ where: eq(act.id, id) });
        if (!actToDelete) return;

        await this.touchBookLastEdited(id, 'act');
        await db.delete(act).where(eq(act.id, id));

        await db.update(act)
            .set({ position: sql`${act.position} - 1` })
            .where(and(eq(act.bookId, actToDelete.bookId), gt(act.position, actToDelete.position)));
    }

    async deleteChapter(id: string): Promise<void> {
        const chapterToDelete = await db.query.chapter.findFirst({ where: eq(chapter.id, id) });
        if (!chapterToDelete) return;

        await this.touchBookLastEdited(id, 'chapter');
        await db.delete(chapter).where(eq(chapter.id, id));

        await db.update(chapter)
            .set({ position: sql`${chapter.position} - 1` })
            .where(and(eq(chapter.actId, chapterToDelete.actId), gt(chapter.position, chapterToDelete.position)));
    }

    async deleteScene(id: string): Promise<void> {
        const sceneToDelete = await db.query.scene.findFirst({ where: eq(scene.id, id) });
        if (!sceneToDelete) return;

        await this.touchBookLastEdited(id, 'scene');
        await db.delete(scene).where(eq(scene.id, id));

        await db.update(scene)
            .set({ position: sql`${scene.position} - 1` })
            .where(and(eq(scene.chapterId, sceneToDelete.chapterId), gt(scene.position, sceneToDelete.position)));
    }

    /**
     * Dynamically calculates the sum of word counts from scenes based on hierarchical mode.
     */
    async getWordCount(mode: 'book' | 'act' | 'chapter' | 'scene', id: string): Promise<number> {
        switch (mode) {
            case 'scene': {
                const [s] = await db.select({ wordCount: scene.wordCount }).from(scene).where(eq(scene.id, id));
                return s?.wordCount ?? 0;
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
     * Fetches the prose JSON for a batch of scenes by their IDs.
     * Returns a map of sceneId → TiptapJsonDoc (or null if the scene has no prose).
     * Used by the lazy-loading skeleton patch mechanism to hydrate skeleton nodes
     * with real content when they scroll into view.
     */
    async getScenesProse(sceneIds: string[]): Promise<Record<string, any>> {
        if (sceneIds.length === 0) return {};

        const rows = await db.query.scene.findMany({
            where: (scenes, { inArray }) => inArray(scenes.id, sceneIds),
            columns: { id: true, prose: true }
        });

        const result: Record<string, any> = {};
        for (const row of rows) {
            result[row.id] = row.prose ?? null;
        }
        return result;
    }

    /**
     * Fetches the full book hierarchy (acts -> chapters -> scenes) without loading heavy prose.
     * Used for building the navigation tree in the UI.
     */
    async getBookHierarchy(mode: 'book' | 'act' | 'chapter' | 'scene', id: string): Promise<ActDto[]> {
        let bookId: string | undefined;

        if (mode === 'book') {
            bookId = id;
        } else if (mode === 'act') {
            const a = await db.query.act.findFirst({ where: eq(act.id, id) });
            bookId = a?.bookId;
        } else if (mode === 'chapter') {
            const c = await db.query.chapter.findFirst({
                where: eq(chapter.id, id),
                with: { act: true }
            });
            bookId = c?.act?.bookId;
        } else if (mode === 'scene') {
            const s = await db.query.scene.findFirst({
                where: eq(scene.id, id),
                with: { chapter: { with: { act: true } } }
            });
            bookId = s?.chapter?.act?.bookId;
        }

        if (!bookId) return [];

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
                            orderBy: (scenes, { asc }) => [asc(scenes.position)]
                        }
                    }
                }
            },
            orderBy: (acts, { asc }) => [asc(acts.position)]
        });

        // The Drizzle query omits 'prose' and 'summary', but we cast to ActDto[]
        // because the IPC bridge will serialize it and the frontend interface expects them.
        // It's perfectly fine if those keys are undefined/missing over IPC for a lightweight tree.
        return acts as unknown as ActDto[];
    }

    /**
     * Dynamically counts all chapters belonging to a specific book.
     */
    async getChapterCount(bookId: string): Promise<number> {
        const [result] = await db
            .select({ count: sql<number>`count(${chapter.id})` })
            .from(chapter)
            .innerJoin(act, eq(chapter.actId, act.id))
            .where(eq(act.bookId, bookId));
        return Number(result?.count ?? 0);
    }
}

export const manuscriptRepository = new ManuscriptRepository();
