import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import type { ActDto, ArchiveOverviewDto } from '../../../../../shared/models/manuscript.model';
import type {
  DropdownOption,
  DropdownSection,
} from '../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ToastService } from '../../../shared/services/toast.service';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';

interface ArchiveState {
  bookId: string | null;
  overview: ArchiveOverviewDto;
  activeHierarchy: ActDto[];
  isLoading: boolean;
  loadError: string | null;
  restoringKey: string | null;
  deletingKey: string | null;
}

const emptyOverview = (): ArchiveOverviewDto => ({
  archivedActs: [],
  archivedChapters: [],
  archivedScenes: [],
});

const initialState: ArchiveState = {
  bookId: null,
  overview: emptyOverview(),
  activeHierarchy: [],
  isLoading: false,
  loadError: null,
  restoringKey: null,
  deletingKey: null,
};

export const ArchiveStore = signalStore(
  withState(initialState),

  withComputed((store) => ({
    archivedActs: computed(() => store.overview().archivedActs),
    archivedChapters: computed(() => store.overview().archivedChapters),
    archivedScenes: computed(() => store.overview().archivedScenes),
    isRestoring: computed(() => store.restoringKey() !== null),
    isDeleting: computed(() => store.deletingKey() !== null),
    isBusy: computed(() => store.restoringKey() !== null || store.deletingKey() !== null),
    activeActOptions: computed<DropdownOption[]>(() =>
      store.activeHierarchy().map((act) => ({
        value: act.id,
        label: act.title,
      })),
    ),
    activeChapterSections: computed<DropdownSection[]>(() =>
      store
        .activeHierarchy()
        .map((act) => ({
          key: `act-${act.id}`,
          title: act.title,
          options: (act.chapters ?? []).map((chapter) => ({
            value: chapter.id,
            label: chapter.title,
          })),
        }))
        .filter((section) => section.options.length > 0),
    ),
  })),

  withMethods(
    (
      store,
      manuscriptStructureService = inject(ManuscriptStructureService),
      toastService = inject(ToastService),
    ) => {
      const fetchArchiveData = async (
        bookId: string,
      ): Promise<{ overview: ArchiveOverviewDto; hierarchy: ActDto[] }> => {
        const [overview, hierarchy] = await Promise.all([
          manuscriptStructureService.getArchiveOverview(bookId),
          manuscriptStructureService.getBookHierarchy('book', bookId),
        ]);
        return { overview, hierarchy };
      };

      const refreshArchiveData = async (): Promise<void> => {
        const bookId = store.bookId();
        if (!bookId) return;

        const { overview, hierarchy } = await fetchArchiveData(bookId);
        patchState(store, {
          overview,
          activeHierarchy: hierarchy,
          loadError: null,
        });
      };

      const runRestore = async (key: string, operation: () => Promise<void>): Promise<boolean> => {
        if (store.restoringKey() || store.deletingKey()) return false;

        patchState(store, { restoringKey: key });
        try {
          await operation();
          try {
            await refreshArchiveData();
          } catch (error) {
            toastService.error(
              error instanceof Error
                ? error.message
                : 'The item was restored, but the archive could not be refreshed.',
              'Archive refresh failed',
            );
          }
          return true;
        } catch (error) {
          toastService.error(
            error instanceof Error ? error.message : 'Unable to restore this item.',
            'Restore failed',
          );
          return false;
        } finally {
          patchState(store, { restoringKey: null });
        }
      };

      const runDelete = async (key: string, operation: () => Promise<void>): Promise<boolean> => {
        if (store.restoringKey() || store.deletingKey()) return false;

        patchState(store, { deletingKey: key });
        try {
          await operation();
          try {
            await refreshArchiveData();
          } catch (error) {
            toastService.error(
              error instanceof Error
                ? error.message
                : 'The item was deleted, but the archive could not be refreshed.',
              'Archive refresh failed',
            );
          }
          return true;
        } catch (error) {
          toastService.error(
            error instanceof Error ? error.message : 'Unable to delete this item.',
            'Delete failed',
          );
          return false;
        } finally {
          patchState(store, { deletingKey: null });
        }
      };

      return {
        async load(bookId: string): Promise<void> {
          patchState(store, {
            bookId,
            isLoading: true,
            loadError: null,
          });

          try {
            const { overview, hierarchy } = await fetchArchiveData(bookId);
            patchState(store, {
              overview,
              activeHierarchy: hierarchy,
              isLoading: false,
            });
          } catch (error) {
            patchState(store, {
              overview: emptyOverview(),
              activeHierarchy: [],
              isLoading: false,
              loadError:
                error instanceof Error ? error.message : 'Unable to load archived content.',
            });
          }
        },

        restoreAct(id: string): Promise<boolean> {
          return runRestore(`act:${id}`, () => manuscriptStructureService.restoreAct(id));
        },

        restoreChapter(id: string, targetActId: string): Promise<boolean> {
          return runRestore(`chapter:${id}`, () =>
            manuscriptStructureService.restoreChapter(id, targetActId),
          );
        },

        restoreScene(id: string, targetChapterId: string): Promise<boolean> {
          return runRestore(`scene:${id}`, () =>
            manuscriptStructureService.restoreScene(id, targetChapterId),
          );
        },

        deleteAct(id: string): Promise<boolean> {
          return runDelete(`act:${id}`, () => manuscriptStructureService.deleteAct(id));
        },

        deleteChapter(id: string): Promise<boolean> {
          return runDelete(`chapter:${id}`, () => manuscriptStructureService.deleteChapter(id));
        },

        deleteScene(id: string): Promise<boolean> {
          return runDelete(`scene:${id}`, () => manuscriptStructureService.deleteScene(id));
        },
      };
    },
  ),
);
