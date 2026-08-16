import type {
  ActDto,
  ArchiveActDto,
  ArchiveChapterDto,
  ArchiveOverviewDto,
  ArchiveSceneDto,
  ChapterDto,
  SceneDto,
  TiptapJsonDoc,
} from '../../shared/models/manuscript.model';
import { fromSqliteBoolean, parseSqliteJson } from '../core/sqlite-values';
import type { ActRow, ChapterRow, SceneRow } from '../schema';

export type ManuscriptSceneRow = Omit<SceneRow, 'prose'> & { prose?: string | null };

export type ArchiveActRow = Pick<ActRow, 'id' | 'title' | 'bookId' | 'position' | 'status'>;
export type ArchiveChapterRow = Pick<
  ChapterRow,
  'id' | 'title' | 'actId' | 'archiveParentTitle' | 'position' | 'status'
>;
export type ArchiveSceneRow = Pick<
  SceneRow,
  'id' | 'title' | 'chapterId' | 'archiveParentTitle' | 'position' | 'status'
>;

export interface ActiveManuscriptAggregateRows {
  acts: ActRow[];
  chapters: ChapterRow[];
  scenes: ManuscriptSceneRow[];
}

export interface ArchiveOverviewRows {
  activeActs: Pick<ActRow, 'id' | 'position'>[];
  activeChapters: Pick<ChapterRow, 'id' | 'actId' | 'position'>[];
  archivedActs: ArchiveActRow[];
  archivedActChapters: ArchiveChapterRow[];
  archivedActScenes: ArchiveSceneRow[];
  archivedChapters: ArchiveChapterRow[];
  archivedChapterScenes: ArchiveSceneRow[];
  archivedScenes: ArchiveSceneRow[];
}

export function mapSceneRow(row: ManuscriptSceneRow): SceneDto {
  if (!row.chapterId) {
    throw new Error(`Active scene "${row.id}" has no parent chapter.`);
  }

  return {
    id: row.id,
    title: row.title,
    chapterId: row.chapterId,
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

export function mapChapterRow(row: ChapterRow, scenes: SceneDto[] = []): ChapterDto {
  if (!row.actId) {
    throw new Error(`Active chapter "${row.id}" has no parent act.`);
  }

  return {
    id: row.id,
    title: row.title,
    actId: row.actId,
    position: row.position,
    status: row.status,
    summary: row.summary,
    scenes,
  };
}

export function mapActRow(row: ActRow, chapters: ChapterDto[] = []): ActDto {
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

export function mapActiveManuscriptAggregate({
  acts,
  chapters,
  scenes,
}: ActiveManuscriptAggregateRows): ActDto[] {
  const actsById = new Map(acts.map((act) => [act.id, act]));
  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const scenesByChapter = new Map<string, SceneDto[]>();

  for (const scene of scenes) {
    if (!scene.chapterId || !chaptersById.has(scene.chapterId)) {
      throw new Error(`Active scene "${scene.id}" references a missing parent chapter.`);
    }
    const mappedScenes = scenesByChapter.get(scene.chapterId) ?? [];
    mappedScenes.push(mapSceneRow(scene));
    scenesByChapter.set(scene.chapterId, mappedScenes);
  }

  const chaptersByAct = new Map<string, ChapterDto[]>();
  for (const chapter of chapters) {
    if (!chapter.actId || !actsById.has(chapter.actId)) {
      throw new Error(`Active chapter "${chapter.id}" references a missing parent act.`);
    }
    const mappedChapters = chaptersByAct.get(chapter.actId) ?? [];
    mappedChapters.push(mapChapterRow(chapter, scenesByChapter.get(chapter.id) ?? []));
    chaptersByAct.set(chapter.actId, mappedChapters);
  }

  return acts.map((act) => mapActRow(act, chaptersByAct.get(act.id) ?? []));
}

export function mapArchiveOverviewAggregate({
  activeActs,
  activeChapters,
  archivedActs,
  archivedActChapters,
  archivedActScenes,
  archivedChapters,
  archivedChapterScenes,
  archivedScenes,
}: ArchiveOverviewRows): ArchiveOverviewDto {
  const activeActOrder = new Map(activeActs.map(({ id }, index) => [id, index]));
  const activeChapterOrder = new Map(
    [...activeChapters]
      .sort((left, right) => parentOrder(left.actId, activeActOrder) - parentOrder(right.actId, activeActOrder) || left.position - right.position)
      .map(({ id }, index) => [id, index]),
  );

  const actScenesByChapter = groupArchiveScenes(archivedActScenes);
  const actChaptersByAct = groupArchiveChapters({
    chapters: archivedActChapters,
    scenesByChapter: actScenesByChapter,
  });

  const mappedArchivedActs: ArchiveActDto[] = archivedActs.map((act) => ({
    ...act,
    chapters: actChaptersByAct.get(act.id) ?? [],
  }));
  const chapterScenes = groupArchiveScenes(archivedChapterScenes);
  const mappedArchivedChapters: ArchiveChapterDto[] = archivedChapters.map((chapter) => ({
    ...chapter,
    scenes: chapterScenes.get(chapter.id) ?? [],
  }));
  const mappedArchivedScenes: ArchiveSceneDto[] = [...archivedScenes];

  mappedArchivedChapters.sort((left, right) =>
    parentOrder(left.actId, activeActOrder) - parentOrder(right.actId, activeActOrder) ||
    left.position - right.position,
  );
  mappedArchivedScenes.sort((left, right) =>
    parentOrder(left.chapterId, activeChapterOrder) - parentOrder(right.chapterId, activeChapterOrder) ||
    left.position - right.position,
  );

  return {
    archivedActs: mappedArchivedActs,
    archivedChapters: mappedArchivedChapters,
    archivedScenes: mappedArchivedScenes,
  };
}

function groupArchiveScenes(rows: ArchiveSceneRow[]): Map<string, ArchiveSceneDto[]> {
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

function groupArchiveChapters({
  chapters,
  scenesByChapter,
}: {
  chapters: ArchiveChapterRow[];
  scenesByChapter: Map<string, ArchiveSceneDto[]>;
}): Map<string, ArchiveChapterDto[]> {
  const grouped = new Map<string, ArchiveChapterDto[]>();
  for (const chapter of chapters) {
    if (chapter.actId) {
      const mappedChapters = grouped.get(chapter.actId) ?? [];
      mappedChapters.push({ ...chapter, scenes: scenesByChapter.get(chapter.id) ?? [] });
      grouped.set(chapter.actId, mappedChapters);
    }
  }
  return grouped;
}

function parentOrder(parentId: string | null, order: Map<string, number>): number {
  return parentId === null ? Number.MAX_SAFE_INTEGER : (order.get(parentId) ?? 0);
}
