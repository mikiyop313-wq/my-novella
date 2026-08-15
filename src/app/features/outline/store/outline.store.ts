import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import {
  ActDto,
  ChapterDto,
  SceneDto,
  SetContextInclusionPayload,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
  UpdateStructurePositionsPayload,
} from '../../../../../shared/models/manuscript.model';
import { withEffectiveContextInclusion } from '../../../../../shared/utils/manuscript-context-inclusion';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';
import { WorkspaceStore } from '../../workspace/workspace.store';

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

// Shape of the outline feature state held by the signal store.
export interface OutlineState {
  bookId: string | null;
  outline: ActDto[];
  isLoading: boolean;
  error: string | null;
}

// Initial state used when the outline store is created.
const initialState: OutlineState = {
  bookId: null,
  outline: [],
  isLoading: false,
  error: null,
};

// -----------------------------------------------------------------------------
// Normalizers
// -----------------------------------------------------------------------------

// Normalizers keep optional child collections safe for UI code.
const normalizeAct = (act: ActDto): ActDto => ({
  ...act,
  chapters: act.chapters ?? [],
});

const normalizeChapter = (chapter: ChapterDto): ChapterDto => ({
  ...chapter,
  scenes: chapter.scenes ?? [],
});

const normalizeOutline = (outline: ActDto[]): ActDto[] =>
  withEffectiveContextInclusion(outline.map((act) => ({
    ...normalizeAct(act),
    chapters: (act.chapters ?? []).map(normalizeChapter),
  })));

// -----------------------------------------------------------------------------
// Position Helpers
// -----------------------------------------------------------------------------

// Reindex helpers keep positions sequential after removing items.
const reindexChapters = (chapters: ChapterDto[]): ChapterDto[] =>
  chapters.map((chapter, position) => ({ ...chapter, position }));

const reindexScenes = (scenes: SceneDto[]): SceneDto[] =>
  scenes.map((scene, position) => ({ ...scene, position }));

const sortByPosition = <T extends { position: number }>(items: T[]): T[] =>
  [...items].sort((first, second) => first.position - second.position);

const groupBy = <T, K extends string>(items: T[], keyFor: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
};

const mapById = <T extends { id: string }>(items: T[] | undefined): Map<string, T> =>
  new Map((items ?? []).map(item => [item.id, item]));

const applyStructurePositions = (
  outline: ActDto[],
  payload: UpdateStructurePositionsPayload,
): ActDto[] => {
  const actUpdates = mapById(payload.acts);
  const chapterUpdates = mapById(payload.chapters);
  const sceneUpdates = mapById(payload.scenes);

  const scenes = outline
    .flatMap(act => (act.chapters ?? []).flatMap(chapter => chapter.scenes ?? []))
    .map(scene => ({ ...scene, ...sceneUpdates.get(scene.id) }));
  const scenesByChapter = groupBy(scenes, scene => scene.chapterId);

  const chapters = outline
    .flatMap(act => act.chapters ?? [])
    .map(chapter => ({
      ...chapter,
      ...chapterUpdates.get(chapter.id),
      scenes: sortByPosition(scenesByChapter.get(chapter.id) ?? []),
    }));
  const chaptersByAct = groupBy(chapters, chapter => chapter.actId);

  return sortByPosition(outline.map(act => ({
    ...act,
    ...actUpdates.get(act.id),
    chapters: sortByPosition(chaptersByAct.get(act.id) ?? []),
  })));
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

// Main outline store for loading and editing the book hierarchy.
export const OutlineStore = signalStore(
  { providedIn: 'root' },

  // Base state.
  withState(initialState),

  // Computed values exposed to components.
  withComputed(({ outline }) => ({
    bookHierarchy: computed(() => outline()),
  })),

  // Public methods plus private helpers that mutate local state.
  withMethods((
    store,
    manuscriptStructureService = inject(ManuscriptStructureService),
    workspaceStore = inject(WorkspaceStore),
  ) => {
    // Convert unknown errors into strings that can be stored/displayed.
    const getErrorMessage = (error: unknown, fallback: string): string =>
      error instanceof Error ? error.message : fallback;

    const resetLastRouteForRemovedEntity = (
      mode: 'act' | 'chapter' | 'scene',
      id: string,
    ): void => {
      const bookId = store.bookId();
      if (!bookId) return;

      workspaceStore.resetLastManuscriptRouteForRemovedEntity({ bookId, mode, id });
    };

    // -------------------------------------------------------------------------
    // Local Append Helpers
    // -------------------------------------------------------------------------

    // Local append helpers update the in-memory hierarchy after backend creates.
    const appendAct = (act: ActDto): void => {
      patchState(store, {
        outline: normalizeOutline([...store.outline(), normalizeAct(act)]),
      });
    };

    const appendChapter = (chapter: ChapterDto): void => {
      patchState(store, {
        // Replace only the matching act, then append the new chapter immutably.
        outline: normalizeOutline(store.outline().map(act =>
          act.id === chapter.actId
            ? {
                ...act,
                chapters: [...(act.chapters ?? []), normalizeChapter(chapter)],
              }
            : act,
        )),
      });
    };

    const appendScene = (scene: SceneDto): void => {
      patchState(store, {
        // Walk acts and chapters until the owning chapter is found.
        outline: normalizeOutline(store.outline().map(act => ({
          ...act,
          chapters: (act.chapters ?? []).map(chapter =>
            chapter.id === scene.chapterId
              ? {
                  ...chapter,
                  scenes: [...(chapter.scenes ?? []), scene],
                }
              : chapter,
          ),
        }))),
      });
    };

    // -------------------------------------------------------------------------
    // Local Remove Helpers
    // -------------------------------------------------------------------------

    // Local remove helpers update state after delete/archive calls succeed.
    const removeAct = (id: string): void => {
      patchState(store, {
        outline: store.outline()
          .filter(act => act.id !== id)
          .map((act, position) => ({ ...act, position })),
      });
    };

    const removeChapter = (id: string): void => {
      patchState(store, {
        outline: store.outline().map(act => ({
          ...act,
          chapters: reindexChapters((act.chapters ?? []).filter(chapter => chapter.id !== id)),
        })),
      });
    };

    const removeScene = (id: string): void => {
      patchState(store, {
        outline: store.outline().map(act => ({
          ...act,
          chapters: (act.chapters ?? []).map(chapter => ({
            ...chapter,
            scenes: reindexScenes((chapter.scenes ?? []).filter(scene => scene.id !== id)),
          })),
        })),
      });
    };

    // -------------------------------------------------------------------------
    // Local Update Helpers
    // -------------------------------------------------------------------------

    const patchActMetadata = (payload: UpdateActPayload): void => {
      patchState(store, {
        outline: normalizeOutline(store.outline().map(act =>
          act.id === payload.id
            ? {
                ...act,
                ...(payload.title !== undefined ? { title: payload.title } : {}),
                ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
              }
            : act,
        )),
      });
    };

    const patchChapterMetadata = (payload: UpdateChapterPayload): void => {
      patchState(store, {
        outline: normalizeOutline(store.outline().map(act => ({
          ...act,
          chapters: (act.chapters ?? []).map(chapter =>
            chapter.id === payload.id
              ? {
                  ...chapter,
                  ...(payload.title !== undefined ? { title: payload.title } : {}),
                  ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
                }
              : chapter,
          ),
        }))),
      });
    };

    const patchSceneMetadata = (payload: UpdateScenePayload): void => {
      patchState(store, {
        outline: normalizeOutline(store.outline().map(act => ({
          ...act,
          chapters: (act.chapters ?? []).map(chapter => ({
            ...chapter,
            scenes: (chapter.scenes ?? []).map(scene =>
              scene.id === payload.id
                ? {
                    ...scene,
                    ...(payload.title !== undefined ? { title: payload.title } : {}),
                    ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
                  }
                : scene,
            ),
          })),
        }))),
      });
    };

    return {
      // -----------------------------------------------------------------------
      // Loading
      // -----------------------------------------------------------------------

      // Loads the current book outline from the Electron backend.
      async enterBook(bookId: string): Promise<void> {
        patchState(store, {
          bookId,
          isLoading: true,
          error: null,
        });

        try {
          const outline = await manuscriptStructureService.getOutline(bookId);
          patchState(store, {
            outline: normalizeOutline(outline),
            isLoading: false,
          });
        } catch (error) {
          patchState(store, {
            outline: [],
            isLoading: false,
            error: getErrorMessage(error, 'Failed to load outline'),
          });
        }
      },

      // -----------------------------------------------------------------------
      // Create
      // -----------------------------------------------------------------------

      // Create methods persist new entities, then append them locally.
      async createAct(bookId: string): Promise<void> {
        patchState(store, { error: null });

        try {
          const act = await manuscriptStructureService.createAct(bookId);
          appendAct(act);
        } catch (error) {
          throw error;
        }
      },

      async createChapter(actId: string): Promise<void> {
        patchState(store, { error: null });

        try {
          const chapter = await manuscriptStructureService.createChapter(actId);
          appendChapter(chapter);
        } catch (error) {
          throw error;
        }
      },

      async createScene(chapterId: string): Promise<void> {
        patchState(store, { error: null });

        try {
          const scene = await manuscriptStructureService.createScene(chapterId);
          appendScene(scene);
        } catch (error) {
          throw error;
        }
      },

      // -----------------------------------------------------------------------
      // Delete
      // -----------------------------------------------------------------------

      // Delete methods persist removal, then remove the entity locally.
      async deleteAct(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.deleteAct(id);
          removeAct(id);
          resetLastRouteForRemovedEntity('act', id);
        } catch (error) {
          throw error;
        }
      },

      async deleteChapter(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.deleteChapter(id);
          removeChapter(id);
          resetLastRouteForRemovedEntity('chapter', id);
        } catch (error) {
          throw error;
        }
      },

      async deleteScene(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.deleteScene(id);
          removeScene(id);
          resetLastRouteForRemovedEntity('scene', id);
        } catch (error) {
          throw error;
        }
      },

      // -----------------------------------------------------------------------
      // Archive
      // -----------------------------------------------------------------------

      // Archive methods hide archived entities from the active outline.
      async archiveAct(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.archiveAct(id);
          removeAct(id);
          resetLastRouteForRemovedEntity('act', id);
        } catch (error) {
          throw error;
        }
      },

      async archiveChapter(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.archiveChapter(id);
          removeChapter(id);
          resetLastRouteForRemovedEntity('chapter', id);
        } catch (error) {
          throw error;
        }
      },

      async archiveScene(id: string): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.archiveScene(id);
          removeScene(id);
          resetLastRouteForRemovedEntity('scene', id);
        } catch (error) {
          throw error;
        }
      },

      // -----------------------------------------------------------------------
      // Metadata Updates
      // -----------------------------------------------------------------------

      async updateAct(payload: UpdateActPayload): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.updateAct(payload);
          patchActMetadata(payload);
        } catch (error) {
          throw error;
        }
      },

      async updateChapter(payload: UpdateChapterPayload): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.updateChapter(payload);
          patchChapterMetadata(payload);
        } catch (error) {
          throw error;
        }
      },

      async updateScene(payload: UpdateScenePayload): Promise<void> {
        patchState(store, { error: null });

        try {
          await manuscriptStructureService.updateScene(payload);
          patchSceneMetadata(payload);
        } catch (error) {
          throw error;
        }
      },

      async setContextInclusion(payload: SetContextInclusionPayload): Promise<void> {
        patchState(store, { error: null });
        const outline = await manuscriptStructureService.setContextInclusion(payload);
        patchState(store, { outline: normalizeOutline(outline) });
      },

      // -----------------------------------------------------------------------
      // Structure Positions
      // -----------------------------------------------------------------------

      async updateStructurePositions(payload: UpdateStructurePositionsPayload): Promise<void> {
        const previousOutline = store.outline();

        patchState(store, { error: null });
        patchState(store, {
          outline: applyStructurePositions(previousOutline, payload),
        });

        try {
          await manuscriptStructureService.updateStructurePositions(payload);
        } catch (error) {
          patchState(store, { outline: previousOutline });
          throw error;
        }
      },
    };
  }),
);
