import { inject, computed } from '@angular/core';
import { signalStore, withState, withMethods, patchState, withComputed } from '@ngrx/signals';
import { BookDto } from '../../../../../shared/models/book.model';
import { LibraryService } from '../services/library.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

export interface BookUi extends BookDto {
  displayCoverImage: SafeUrl | string;
}

export type OrderByType = 'name' | 'lastUpdate' | 'latestCreation' | 'oldestCreation';

export interface LibraryState {
  books: BookUi[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  orderBy: OrderByType;
}

const initialState: LibraryState = {
  books: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  orderBy: 'lastUpdate',
};

export const LibraryStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed(({ books, searchQuery, orderBy }) => ({
    filteredBooks: computed(() => {
      const query = searchQuery().toLowerCase();
      const allBooks = books();
      const order = orderBy();

      let filtered = allBooks.filter((book: BookUi) => 
        book.title.toLowerCase().includes(query) || 
        book.author.toLowerCase().includes(query) ||
        book.synopsis?.toLowerCase().includes(query)
      );

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

  withComputed(({ filteredBooks, orderBy }) => ({
    groupedBooks: computed(() => {
      const books = filteredBooks();
      const order = orderBy();
      const groups: { label: string, books: BookUi[] }[] = [];

      if (order === 'name') {
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
        // Chronological grouping
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const timeGroups = [
          { label: 'Today', filter: (d: Date) => d >= today },
          { label: 'Yesterday', filter: (d: Date) => d >= yesterday && d < today },
          { label: 'This Week', filter: (d: Date) => d >= thisWeek && d < yesterday },
          { label: 'This Month', filter: (d: Date) => d >= thisMonth && d < thisWeek },
          { label: 'Earlier this Year', filter: (d: Date) => d.getFullYear() === now.getFullYear() && d < thisMonth },
          { label: 'Older', filter: (d: Date) => d.getFullYear() < now.getFullYear() },
        ];

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

  withComputed(({ groupedBooks }) => ({
    indexItems: computed(() => {
      return groupedBooks().map((g) => g.label);
    })
  })),

  withMethods((
    store, 
    libraryService = inject(LibraryService),
    sanitizer = inject(DomSanitizer)
  ) => ({

    async loadBooks() {
      patchState(store, { isLoading: true, error: null });

      try {
        const books = await libraryService.getBooks();
        // Process books to add display URLs
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

    getSafeDisplayUrl(book: BookDto, sanitizer: DomSanitizer): SafeUrl | string {
      const fallback = 'https://images.unsplash.com/photo-1519791883288-dc8bd696e667?auto=format&fit=crop&q=80&w=800';

      if (!book.coverImage) return fallback;

      const coverImage = book.coverImage as Uint8Array | string | Record<string, number>;

      // Plain data URL string
      if (typeof coverImage === 'string') {
        if (coverImage.startsWith('data:')) {
          return this.displayFromDataUrl(coverImage, sanitizer) ?? fallback;
        }
        return coverImage; // already an http/blob URL
      }

      // Binary data — either a true Uint8Array or a plain object from IPC deserialization
      const bytes = this.ensureUint8Array(coverImage as Uint8Array);

      // Detect if binary is actually a 'data:...' string stored as bytes
      if (bytes[0] === 100 && bytes[1] === 97 && bytes[2] === 116 &&
          bytes[3] === 97 && bytes[4] === 58) {
        const dataUrl = new TextDecoder().decode(bytes);
        return this.displayFromDataUrl(dataUrl, sanitizer) ?? fallback;
      }

      // True raw image bytes — create blob URL directly
      return this.displayBlob(bytes, sanitizer);
    },

    /** Electron IPC may deserialize Uint8Array as a plain object { 0: n, 1: n, ... }.
     *  This normalizes both cases into a real Uint8Array. */
    ensureUint8Array(data: Uint8Array | Record<string, number>): Uint8Array {
      if (data instanceof Uint8Array) return data;
      // Plain object with numeric keys from IPC deserialization
      const values = Object.values(data as Record<string, number>);
      return new Uint8Array(values);
    },

    displayBlob(rawImageData: Uint8Array | Record<string, number>, sanitizer: DomSanitizer): SafeUrl {
      const bytes = this.ensureUint8Array(rawImageData as Uint8Array);
      // Wrap in a fresh Uint8Array to guarantee an ArrayBuffer backing (not SharedArrayBuffer),
      // which is required by the Blob constructor's BlobPart type.
      const safeBytes = new Uint8Array(bytes);
      const blob = new Blob([safeBytes.buffer], { type: 'image/png' });
      const objectURL = URL.createObjectURL(blob);
      return sanitizer.bypassSecurityTrustUrl(objectURL);
    },

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

    setSearchQuery(query: string) {
      patchState(store, { searchQuery: query });
    },

    setOrderBy(orderBy: OrderByType) {
      patchState(store, { orderBy });
    }

  }))
);
