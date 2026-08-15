import { Component } from '@angular/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { BookModalComponent } from '../book-modal/book-modal.component';

@Component({
  selector: 'app-book-card',
  imports: [OverlayMenuDirective, OverlayModalDirective, BookModalComponent],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.scss',
})
export class BookCardComponent {

}
