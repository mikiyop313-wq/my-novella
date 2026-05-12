import { Injectable, inject } from '@angular/core';
import { ElectronService } from '../../../core/services/electron.service';
import { BookDto, CreateBookDto, UpdateBookDto } from '../../../../../shared/models/book.model';

export type Book = BookDto;

@Injectable({
  providedIn: 'root',
})
export class LibraryService {
  private electronService = inject(ElectronService);

  async getBooks(): Promise<Book[]> {
    return await this.electronService.invoke('library:get-all-books');
  }

  async addNewBook(book: CreateBookDto): Promise<Book> {
    return await this.electronService.invoke('library:add-book', book);
  }

  async removeBook(id: string): Promise<{ success: boolean }> {
    return await this.electronService.invoke('library:delete-book', id);
  }

  async updateBook(id: string, data: UpdateBookDto): Promise<Book> {
    return await this.electronService.invoke('library:update-book', { id, data });
  }

  async getLanguages(): Promise<{ languageName: string }[]> {
    return await this.electronService.invoke('library:get-languages');
  }
}
