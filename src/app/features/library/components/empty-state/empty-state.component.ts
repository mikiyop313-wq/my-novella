import { Component, output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss'
})
export class EmptyStateComponent {
  onCreate = output<void>();

  createFirstBook() {
    this.onCreate.emit();
  }
}
