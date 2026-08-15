import { Component, input, output } from '@angular/core';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { BookModalComponent } from '../book-modal/book-modal.component';
import { BookDto, CategoryDto } from '../../../../../../shared/models/book.model';
import { BookUi } from '../../store/book.store';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { Router } from '@angular/router';

@Component({
  selector: 'app-book-card',
  imports: [OverlayModalDirective, BookModalComponent, TimeAgoPipe],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.scss',
})
export class BookCardComponent {
  book = input.required<BookUi>();
  bookDeleted = output<string>();

  constructor(private router: Router) { }

  onBookClicked() {
    this.router.navigate(['/workspace', this.book().id, 'outline']);
  }
}
