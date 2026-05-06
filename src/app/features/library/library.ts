import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookCardComponent } from './components/book-card/book-card.component';
import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { LibraryService, Book } from './services/library.service';

@Component({
  selector: 'app-library',
  imports: [BookCardComponent, SearchBarComponent, EmptyStateComponent],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library implements OnInit {
  private libraryService = inject(LibraryService);

  private router = inject(Router);

  books = signal<Book[]>([]);

  async ngOnInit() {
    await this.loadBooks();
  }

  async loadBooks() {
    try {
      const fetchedBooks = await this.libraryService.getBooks();
      this.books.set(fetchedBooks);
    } catch (error) {
      console.error('Failed to load books:', error);
    }
  }

  onCreateBook() {
    this.router.navigate(['/library/create']);
  }
}
