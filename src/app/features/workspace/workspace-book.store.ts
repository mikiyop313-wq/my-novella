import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ActDto, ManuscriptMode } from '../../../../shared/models/manuscript.model';
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
        bookHierarchy,
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
          bookHierarchy: hierarchy,
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

    updateActTitle(id: string, title: string): void {
      patchState(store, {
        bookHierarchy: store.bookHierarchy().map(act =>
          act.id === id ? { ...act, title } : act
        ),
      });
    },

    updateChapterTitle(id: string, title: string): void {
      patchState(store, {
        bookHierarchy: store.bookHierarchy().map(act => ({
          ...act,
          chapters: (act.chapters || []).map(chapter =>
            chapter.id === id ? { ...chapter, title } : chapter
          ),
        })),
      });
    },

    updateSceneTitle(id: string, title: string): void {
      patchState(store, {
        bookHierarchy: store.bookHierarchy().map(act => ({
          ...act,
          chapters: (act.chapters || []).map(chapter => ({
            ...chapter,
            scenes: (chapter.scenes || []).map(scene =>
              scene.id === id ? { ...scene, title } : scene
            ),
          })),
        })),
      });
    },
  })),
);
