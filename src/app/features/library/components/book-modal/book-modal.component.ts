import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-book-modal',
  standalone: true,
  imports: [],
  templateUrl: './book-modal.component.html',
  styleUrl: './book-modal.component.scss'
})
export class BookModalComponent {
  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }
}
