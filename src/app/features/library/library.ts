import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BookCardComponent } from './components/book-card/book-card.component';
import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { LibraryService, Book } from './services/library.service';
import { LibraryStore } from './store/book.store';

@Component({
  selector: 'app-library',
  imports: [BookCardComponent, SearchBarComponent, EmptyStateComponent],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library implements OnInit {
  private router = inject(Router);
  libraryStore = inject(LibraryStore);

  async ngOnInit() {
    await this.libraryStore.loadBooks();
  }

  onBookDeleted(bookId: string) {
    this.libraryStore.deleteBook(bookId);
  }



  onCreateBook() {
    this.router.navigate(['/library/create']);
  }
}
