import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { BookDto } from '../../../../../shared/models/book.model';
import { LibraryService } from '../services/library.service';

export interface LibraryState {
  books: BookDto[];
  isLoading: boolean;
  error: string | null;
}

const initialState: LibraryState = {
  books: [],
  isLoading: false,
  error: null,
};

export const LibraryStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withMethods((store, libraryService = inject(LibraryService)) => ({

    async loadBooks() {
      patchState(store, { isLoading: true, error: null });

      try {
        const books = await libraryService.getBooks();
        patchState(store, { books, isLoading: false });
      } catch (error) {
        patchState(store, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load books'
        });
      }
    },

    async deleteBook(id: string) {
      try {
        await libraryService.removeBook(id);
        patchState(store, (state) => ({
          books: state.books.filter(b => b.id !== id)
        }));
      } catch (error) {
        patchState(store, {
          error: error instanceof Error ? error.message : 'Failed to delete book'
        });
      }
    },

  }))
);
