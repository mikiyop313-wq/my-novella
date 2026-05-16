import { inject, computed } from '@angular/core';
import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { BookDto } from '../../../../../shared/models/book.model';
import { LibraryService } from '../services/library.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

/**
 * Extended Book model for UI display, adding a sanitized cover image URL
 */
export interface BookUi extends BookDto {
  displayCoverImage: SafeUrl | string;
}

/** Possible sorting strategies for the library */
export type OrderByType = 'name' | 'lastUpdate' | 'latestCreation' | 'oldestCreation';

/**
 * State definition for the Library feature
 */
export interface LibraryState {
  /** All books loaded in the library */
  books: BookUi[];
  /** Loading state indicator */
  isLoading: boolean;
  /** Error message if an operation fails */
  error: string | null;
  /** Current search filter string */
  searchQuery: string;
  /** Current sorting strategy */
  orderBy: OrderByType;
  /** Whether to show archived books */
  showArchived: boolean;
}

const initialState: LibraryState = {
  books: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  orderBy: 'lastUpdate',
  showArchived: false,
};

/**
 * SignalStore managing the library's state, including filtering, sorting, 
 * and grouping logic for books.
 */
export const LibraryStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  // --- Computed Signals ---

  /**
   * Computed signal that returns books filtered by search query and sorted by the current order
   */
  withComputed(({ books, searchQuery, orderBy, showArchived }) => ({
    filteredBooks: computed(() => {
      const query = searchQuery().toLowerCase();
      const allBooks = books();
      const order = orderBy();
      const showArchivedValue = showArchived();

      // Filter books based on title, author, synopsis, or categories and status
      let filtered = allBooks.filter((book: BookUi) => {
        const isArchived = book.status === 'archived';
        if (showArchivedValue ? !isArchived : isArchived) {
          return false;
        }

        return book.title.toLowerCase().includes(query) ||
          book.author.toLowerCase().includes(query) ||
          book.synopsis?.toLowerCase().includes(query) ||
          book.categories?.some(c => c.name.toLowerCase().includes(query));
      });

      // Sort the filtered results based on the active ordering strategy
      return [...filtered].sort((a, b) => {
        switch (order) {
          case 'name':
            return a.title.localeCompare(b.title);
          case 'lastUpdate':
            return new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime();
          case 'latestCreation':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'oldestCreation':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          default:
            return 0;
        }
      });
    })
  })),

  /**
   * Computed signal that organizes books into logical groups (Alphabetical or Chronological)
   * for the library view.
   */
  withComputed(({ filteredBooks, orderBy }) => ({
    groupedBooks: computed(() => {
      const books = filteredBooks();
      const order = orderBy();
      const groups: { label: string, books: BookUi[] }[] = [];

      if (order === 'name') {
        // Group alphabetically (A-Z and # for others)
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
        alphabet.forEach(letter => {
          const groupBooks = books.filter((b: BookUi) => {
            const firstChar = b.title.charAt(0).toUpperCase();
            return letter === '#' ? !/[A-Z]/.test(firstChar) : firstChar === letter;
          });
          if (groupBooks.length > 0) {
            groups.push({ label: letter, books: groupBooks });
          }
        });
      } else {
        // Group chronologically based on last update or creation date
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // Define chronological time ranges
        let timeGroups = [
          { label: 'Today', filter: (d: Date) => d >= today },
          { label: 'Yesterday', filter: (d: Date) => d >= yesterday && d < today },
          { label: 'This Week', filter: (d: Date) => d >= thisWeek && d < yesterday },
          { label: 'This Month', filter: (d: Date) => d >= thisMonth && d < thisWeek },
          { label: 'Earlier this Year', filter: (d: Date) => d.getFullYear() === now.getFullYear() && d < thisMonth },
          { label: 'Older', filter: (d: Date) => d.getFullYear() < now.getFullYear() },
        ];

        // Invert groups if sorting by oldest first
        if (order === 'oldestCreation') {
          timeGroups = [...timeGroups].reverse();
        }

        // Apply filters to assign books to their respective time groups
        timeGroups.forEach(group => {
          const groupBooks = books.filter((b: BookUi) => {
            const date = new Date(order === 'lastUpdate' ? b.lastEditedAt : b.createdAt);
            return group.filter(date);
          });
          if (groupBooks.length > 0) {
            groups.push({ label: group.label, books: groupBooks });
          }
        });
      }

      return groups;
    })
  })),

  /**
   * Computed signal returning an array of group labels for navigation (index bar)
   */
  withComputed(({ groupedBooks }) => ({
    indexItems: computed(() => {
      return groupedBooks().map((g) => g.label);
    })
  })),

  // --- Methods ---

  withMethods((
    store,
    libraryService = inject(LibraryService),
    sanitizer = inject(DomSanitizer)
  ) => ({

    /**
     * Fetches books from the service and processes their cover images for UI display.
     */
    async loadBooks() {
      patchState(store, { isLoading: true, error: null });

      try {
        const books = await libraryService.getBooks();
        // Process books to add sanitized display URLs
        const processedBooks = books.map(book => ({
          ...book,
          displayCoverImage: this.getSafeDisplayUrl(book, sanitizer)
        }));
        patchState(store, { books: processedBooks, isLoading: false });
      } catch (error) {
        patchState(store, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load books'
        });
      }
    },

    /**
     * Determines the appropriate display URL for a book's cover image.
     * Handles binary data, data URLs, and fallbacks.
     */
    getSafeDisplayUrl(book: BookDto, sanitizer: DomSanitizer): SafeUrl | string {
      const fallback = 'https://images.unsplash.com/photo-1519791883288-dc8bd696e667?auto=format&fit=crop&q=80&w=800';

      if (!book.coverImage) return fallback;

      const coverImage = book.coverImage as Uint8Array | string | Record<string, number>;

      // Case 1: Plain URL or Data URL string
      if (typeof coverImage === 'string') {
        if (coverImage.startsWith('data:')) {
          return this.displayFromDataUrl(coverImage, sanitizer) ?? fallback;
        }
        return coverImage; // already an http/blob URL
      }

      // Case 2: Binary data (Uint8Array or IPC object)
      const bytes = this.ensureUint8Array(coverImage as Uint8Array);

      // Special check: Detect if binary is actually a 'data:...' string stored as bytes
      if (bytes[0] === 100 && bytes[1] === 97 && bytes[2] === 116 &&
        bytes[3] === 97 && bytes[4] === 58) {
        const dataUrl = new TextDecoder().decode(bytes);
        return this.displayFromDataUrl(dataUrl, sanitizer) ?? fallback;
      }

      // Case 3: Raw image bytes - convert to Blob URL
      return this.displayBlob(bytes, sanitizer);
    },

    /** 
     * Normalizes binary data received from Electron IPC, which may 
     * deserialize Uint8Array as a plain object { 0: n, 1: n, ... }.
     */
    ensureUint8Array(data: Uint8Array | Record<string, number>): Uint8Array {
      if (data instanceof Uint8Array) return data;
      // Convert plain object with numeric keys to real Uint8Array
      const values = Object.values(data as Record<string, number>);
      return new Uint8Array(values);
    },

    /**
     * Converts raw bytes into a sanitized Blob URL for display.
     */
    displayBlob(rawImageData: Uint8Array | Record<string, number>, sanitizer: DomSanitizer): SafeUrl {
      const bytes = this.ensureUint8Array(rawImageData as Uint8Array);
      // Ensure we have an ArrayBuffer backing (not SharedArrayBuffer)
      const safeBytes = new Uint8Array(bytes);
      const blob = new Blob([safeBytes.buffer], { type: 'image/png' });
      const objectURL = URL.createObjectURL(blob);
      return sanitizer.bypassSecurityTrustUrl(objectURL);
    },

    /**
     * Converts a base64 Data URL string into a sanitized Blob URL.
     * This avoids large string overhead in the DOM and handles security trusts.
     */
    displayFromDataUrl(dataUrl: string, sanitizer: DomSanitizer): SafeUrl | null {
      try {
        const [header, base64] = dataUrl.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([array], { type: mime });
        return sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
      } catch (e) {
        console.error('Failed to convert data URL to blob URL:', e);
        return null;
      }
    },

    /**
     * Deletes a book from the repository and removes it from the local state.
     */
    async deleteBook(id: string) {
      try {
        await libraryService.removeBook(id);
        patchState(store, (state: LibraryState) => ({
          books: state.books.filter((b: BookUi) => b.id !== id)
        }));
      } catch (error) {
        patchState(store, {
          error: error instanceof Error ? error.message : 'Failed to delete book'
        });
      }
    },

    /**
     * Updates a book's data and refreshes its display in the local state.
     */
    async updateBook(id: string, data: any) {
      try {
        const updatedBook = await libraryService.updateBook(id, data);
        const processedBook: BookUi = {
          ...updatedBook,
          displayCoverImage: this.getSafeDisplayUrl(updatedBook, sanitizer)
        };

        patchState(store, (state: LibraryState) => ({
          books: state.books.map((b: BookUi) => b.id === id ? processedBook : b)
        }));
        return processedBook;
      } catch (error) {
        patchState(store, {
          error: error instanceof Error ? error.message : 'Failed to update book'
        });
        throw error;
      }
    },

    /** Updates the search filter query */
    setSearchQuery(query: string) {
      patchState(store, { searchQuery: query });
    },

    /** Updates the sorting strategy */
    setOrderBy(orderBy: OrderByType) {
      patchState(store, { orderBy });
    },

    /** Toggles the display of archived books */
    setShowArchived(showArchived: boolean) {
      patchState(store, { showArchived });
    }

  }))
);

