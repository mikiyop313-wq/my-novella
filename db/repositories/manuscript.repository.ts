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
            .values({ title: 'New Scene', chapterId, position: nextPosition })
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
}

export const manuscriptRepository = new ManuscriptRepository();
