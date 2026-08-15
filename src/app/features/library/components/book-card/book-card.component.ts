import { Component, Input } from '@angular/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { BookModalComponent } from '../book-modal/book-modal.component';
import { BookDto } from '../../../../../../shared/models/book.model';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-book-card',
  imports: [OverlayModalDirective, BookModalComponent, TimeAgoPipe],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.scss',
})
export class BookCardComponent {

  @Input({ required: true }) book!: BookDto;


}
