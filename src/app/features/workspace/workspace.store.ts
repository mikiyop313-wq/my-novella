import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { LibraryService } from '../library/services/library.service';

export type WorkspaceView = 'manuscript' | 'outline' | 'chat' | 'settings';

export interface WorkspaceState {
  bookId: string | null;
  bookTitle: string;
  activeView: WorkspaceView;
  lastWorkspaceUrl: string | null;
  sidebarOpen: boolean;
  isLoadingBook: boolean;
  error: string | null;
}

const initialState: WorkspaceState = {
  bookId: null,
  bookTitle: 'Workspace',
  activeView: 'manuscript',
  lastWorkspaceUrl: null,
  sidebarOpen: true,
  isLoadingBook: false,
  error: null,
};

export const WorkspaceStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withMethods((store, libraryService = inject(LibraryService)) => ({
    async enterBook(bookId: string): Promise<void> {
      patchState(store, {
        bookId,
        isLoadingBook: true,
        error: null,
      });

      try {
        const books = await libraryService.getBooks();
        const book = books.find(item => item.id === bookId);

        patchState(store, {
          bookTitle: book?.title || 'Untitled Book',
          isLoadingBook: false,
        });
      } catch (error) {
        patchState(store, {
          bookTitle: 'Workspace',
          isLoadingBook: false,
          error: error instanceof Error ? error.message : 'Failed to load book',
        });
      }
    },

    setActiveView(activeView: WorkspaceView): void {
      patchState(store, { activeView });
    },

    setLastWorkspaceUrl(lastWorkspaceUrl: string): void {
      patchState(store, { lastWorkspaceUrl });
    },

    openSidebar(): void {
      patchState(store, { sidebarOpen: true });
    },

    closeSidebar(): void {
      patchState(store, { sidebarOpen: false });
    },

    toggleSidebar(): void {
      patchState(store, { sidebarOpen: !store.sidebarOpen() });
    },
  }))
);
