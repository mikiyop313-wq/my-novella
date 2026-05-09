import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { BookDto } from '../../../../../shared/models/book.model';
import { LibraryService } from '../services/library.service';

export interface BookState {
  books: BookDto[];
  isLoading: boolean;
  error: string | null;
}

const initialState: BookState = {
  books: [],
  isLoading: false,
  error: null,
};

export const BookStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),


  withMethods((store, libraryService = inject(LibraryService)) => ({

    async loadBooks() {
      patchState(store, { isLoading: true, error: null });

      try {
        const books = await libraryService.getBooks();
        patchState(store, { books, isLoading: false });
      }

      catch (error) {
        patchState(store, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load books'
        });
      }
    },
  }))
);
