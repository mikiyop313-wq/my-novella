import { Component, inject } from '@angular/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';
import { LibraryStore } from '../../store/book.store';

@Component({
  selector: 'app-search-bar',
  imports: [OverlayMenuDirective],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent {
  libraryStore = inject(LibraryStore);

  setOrderBy(order: any) {
    this.libraryStore.setOrderBy(order);
  }

  onSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.libraryStore.setSearchQuery(query);
  }

  toggleArchived() {
    this.libraryStore.setShowArchived(!this.libraryStore.showArchived());
  }
}
