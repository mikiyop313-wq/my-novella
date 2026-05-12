import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
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
  @Output() bookDeleted = new EventEmitter<string>();

  private sanitizer = inject(DomSanitizer);

  displayCoverImage = computed<SafeUrl | string>(() => {
    if (!this.book.coverImage) {
      return 'https://images.unsplash.com/photo-1519791883288-dc8bd696e667?auto=format&fit=crop&q=80&w=800';
    }

    if (this.book.coverImage instanceof Uint8Array) {
      const blob = new Blob([this.book.coverImage]);
      return this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
    }

    return this.book.coverImage;
  });
}
