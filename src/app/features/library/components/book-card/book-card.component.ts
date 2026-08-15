import { Component } from '@angular/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';

@Component({
  selector: 'app-book-card',
  imports: [OverlayMenuDirective],
  templateUrl: './book-card.component.html',
  styleUrl: './book-card.component.scss',
})
export class BookCardComponent {

}
