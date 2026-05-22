import { db } from '../index';
import { act, chapter, scene } from '../schema/narrative';
import { eq } from 'drizzle-orm';
import { ActDto, ChapterDto, SceneDto, ManuscriptDataDto } from '../../shared/models/manuscript.model';

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
}
export const manuscriptRepository = new ManuscriptRepository();
