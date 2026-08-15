import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LazyBookCardComponent } from './components/lazy-book-card/lazy-book-card.component';
import { SearchBarComponent } from './components/search-bar/search-bar.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { LibraryService, Book } from './services/library.service';
import { LibraryStore } from './store/book.store';
import { IndexScrollComponent } from './components/index-scroll/index-scroll.component';
import { CommonModule } from '@angular/common';
import type { ImportDataResult } from '../../../../shared/models/data-transfer.model';
import { ElectronService } from '../../core/services/electron.service';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-library',
  imports: [
    LazyBookCardComponent,
    SearchBarComponent,
    EmptyStateComponent,
    IndexScrollComponent,
    CommonModule,
  ],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library implements OnInit {
  private router = inject(Router);
  private electronService = inject(ElectronService);
  private toastService = inject(ToastService);
  libraryStore = inject(LibraryStore);
  readonly isImportPending = signal(false);

  async ngOnInit() {
    await this.libraryStore.loadBooks();
  }

  onBookDeleted(bookId: string) {
    this.libraryStore.deleteBook(bookId);
  }

  toggleArchived() {
    this.libraryStore.setShowArchived(!this.libraryStore.showArchived());
  }

  onCreateBook() {
    this.router.navigate(['/library/create']);
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }

  async importArchive(): Promise<void> {
    if (this.isImportPending()) return;

    this.isImportPending.set(true);
    try {
      const result = (await this.electronService.invoke(
        'data-transfer:import',
      )) as ImportDataResult;
      if (result.status === 'imported') {
        await this.libraryStore.loadBooks();
        const bookLabel = result.importedBookIds.length === 1 ? 'book' : 'books';
        this.toastService.success(`Imported ${result.importedBookIds.length} ${bookLabel}.`);
      }
    } catch (error) {
      this.toastService.error(
        error instanceof Error ? error.message : 'Unable to import the archive.',
        'Import failed',
      );
    } finally {
      this.isImportPending.set(false);
    }
  }

  scrollToSection(label: string) {
    const element = document.getElementById(`section-${label}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
