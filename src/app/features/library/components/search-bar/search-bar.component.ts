import { Component, signal } from '@angular/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';

export type OrderByType = 'name' | 'lastUpdate' | 'creation';

@Component({
  selector: 'app-search-bar',
  imports: [OverlayMenuDirective],
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent {
  currentOrderBy = signal<OrderByType>('lastUpdate');

  setOrderBy(order: OrderByType) {
    this.currentOrderBy.set(order);
  }
}
