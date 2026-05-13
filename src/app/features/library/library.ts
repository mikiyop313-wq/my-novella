import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LazyBookCardComponent } from './components/lazy-book-card/lazy-book-card.component';
import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { LibraryService, Book } from './services/library.service';
import { LibraryStore } from './store/book.store';
import { IndexScrollComponent } from './components/index-scroll/index-scroll.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-library',
  imports: [LazyBookCardComponent, SearchBarComponent, EmptyStateComponent, IndexScrollComponent, CommonModule],
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

  scrollToSection(label: string) {
    const element = document.getElementById(`section-${label}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
