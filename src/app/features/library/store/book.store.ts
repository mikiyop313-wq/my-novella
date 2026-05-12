import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { BookDto } from '../../../../../shared/models/book.model';
import { LibraryService } from '../services/library.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

export interface BookUi extends BookDto {
  displayCoverImage: SafeUrl | string;
}

export interface LibraryState {
  books: BookUi[];
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
