import type { ActDto, ChapterDto, SceneDto } from '../models/manuscript.model';

export function hasSceneContextContent(scene: Pick<SceneDto, 'summary' | 'wordCount'>): boolean {
  return (scene.wordCount ?? 0) > 0 || (scene.summary?.trim().length ?? 0) > 0;
}

export function isSceneIncludedInContext(scene: SceneDto): boolean {
  return scene.includeInContext !== false && hasSceneContextContent(scene);
}

export function isChapterIncludedInContext(chapter: ChapterDto): boolean {
  return (chapter.scenes ?? []).some(isSceneIncludedInContext);
}

export function isActIncludedInContext(act: ActDto): boolean {
  return (act.chapters ?? []).some(isChapterIncludedInContext);
}

export function withEffectiveContextInclusion(hierarchy: readonly ActDto[]): ActDto[] {
  return hierarchy.map((act) => {
    const chapters = (act.chapters ?? []).map((chapter) => {
      const scenes = (chapter.scenes ?? []).map((scene) => ({
        ...scene,
        includeInContext: scene.includeInContext !== false,
        isIncludedInContext: isSceneIncludedInContext(scene),
      }));

      return {
        ...chapter,
        scenes,
        isIncludedInContext: scenes.some((scene) => scene.isIncludedInContext === true),
      };
    });

    return {
      ...act,
      chapters,
      isIncludedInContext: chapters.some((chapter) => chapter.isIncludedInContext === true),
    };
  });
}

export function filterHierarchyForContext(
  hierarchy: readonly ActDto[],
  additionallyIncludedSceneIds: ReadonlySet<string> = new Set(),
): ActDto[] {
  return hierarchy.flatMap((act) => {
    const chapters = (act.chapters ?? []).flatMap((chapter) => {
      const scenes = (chapter.scenes ?? []).filter((scene) =>
        isSceneIncludedInContext(scene) || additionallyIncludedSceneIds.has(scene.id),
      );
      return scenes.length > 0 ? [{ ...chapter, scenes, isIncludedInContext: true }] : [];
    });
    return chapters.length > 0 ? [{ ...act, chapters, isIncludedInContext: true }] : [];
  });
}
