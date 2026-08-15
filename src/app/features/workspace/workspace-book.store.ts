import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import {
  ActDto,
  ManuscriptMode,
  UpdateActPayload,
  UpdateChapterPayload,
  UpdateScenePayload,
} from '../../../../shared/models/manuscript.model';
import { withEffectiveContextInclusion } from '../../../../shared/utils/manuscript-context-inclusion';
import { ManuscriptStructureService } from './services/manuscript-structure.service';

export interface WorkspaceBookState {
  bookHierarchy: ActDto[];
  isLoadingBookHierarchy: boolean;
  bookHierarchyError: string | null;
}

const initialState: WorkspaceBookState = {
  bookHierarchy: [],
  isLoadingBookHierarchy: false,
  bookHierarchyError: null,
};

export const WorkspaceBookStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withMethods((store, manuscriptStructureService = inject(ManuscriptStructureService)) => ({
    clearBookHierarchy(): void {
      patchState(store, {
        bookHierarchy: [],
        isLoadingBookHierarchy: false,
        bookHierarchyError: null,
      });
    },

    setBookHierarchy(bookHierarchy: ActDto[]): void {
      patchState(store, {
        bookHierarchy: withEffectiveContextInclusion(bookHierarchy),
        isLoadingBookHierarchy: false,
        bookHierarchyError: null,
      });
    },

    async loadBookHierarchy(mode: ManuscriptMode, id: string): Promise<ActDto[]> {
      patchState(store, {
        isLoadingBookHierarchy: true,
        bookHierarchyError: null,
      });

      try {
        const hierarchy = await manuscriptStructureService.getBookHierarchy(mode, id);
        patchState(store, {
          bookHierarchy: withEffectiveContextInclusion(hierarchy),
          isLoadingBookHierarchy: false,
        });
        return hierarchy;
      } catch (error) {
        patchState(store, {
          bookHierarchy: [],
          isLoadingBookHierarchy: false,
          bookHierarchyError: error instanceof Error ? error.message : 'Failed to load book hierarchy',
        });
        throw error;
      }
    },

    updateActMetadata(payload: UpdateActPayload): void {
      patchState(store, {
        bookHierarchy: withEffectiveContextInclusion(store.bookHierarchy().map(act =>
          act.id === payload.id
            ? {
                ...act,
                ...(payload.title !== undefined ? { title: payload.title } : {}),
                ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
              }
            : act
        )),
      });
    },

    updateChapterMetadata(payload: UpdateChapterPayload): void {
      patchState(store, {
        bookHierarchy: withEffectiveContextInclusion(store.bookHierarchy().map(act => ({
          ...act,
          chapters: (act.chapters || []).map(chapter =>
            chapter.id === payload.id
              ? {
                  ...chapter,
                  ...(payload.title !== undefined ? { title: payload.title } : {}),
                  ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
                }
              : chapter
          ),
        }))),
      });
    },

    updateSceneMetadata(payload: UpdateScenePayload): void {
      patchState(store, {
        bookHierarchy: withEffectiveContextInclusion(store.bookHierarchy().map(act => ({
          ...act,
          chapters: (act.chapters || []).map(chapter => ({
            ...chapter,
            scenes: (chapter.scenes || []).map(scene =>
              scene.id === payload.id
                ? {
                    ...scene,
                    ...(payload.title !== undefined ? { title: payload.title } : {}),
                    ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
                  }
                : scene
            ),
          })),
        }))),
      });
    },
  })),
);
