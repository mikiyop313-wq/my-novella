import { Component, input, output, signal, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';
import { BookUi } from '../../store/book.store';
import { BookCardComponent } from '../book-card/book-card.component';

@Component({
  selector: 'app-lazy-book-card',
  standalone: true,
  imports: [BookCardComponent],
  template: `
    @if (isVisible()) {
      <app-book-card class="book-card" [book]="book()" (bookDeleted)="bookDeleted.emit($event)"></app-book-card>
    } @else {
      <div class="book-card-placeholder"></div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      /* Important: Set a min-height matching the card so the scroll height doesn't jump */
      min-height: 450px; 
    }
    
    .book-card-placeholder {
      width: 100%;
      height: 450px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      animation: pulsePlaceholder 1.5s infinite ease-in-out;
    }
    
    @keyframes pulsePlaceholder {
      0% { opacity: 0.4; }
      50% { opacity: 0.8; }
      100% { opacity: 0.4; }
    }
  `]
})
export class LazyBookCardComponent implements OnInit, OnDestroy {
  book = input.required<BookUi>();
  bookDeleted = output<string>();

  isVisible = signal(false);

  private el = inject(ElementRef);
  private observer: IntersectionObserver | null = null;

  ngOnInit() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Set visible when intersecting, false when not.
        // This actively unmounts the component and its heavy DOM/Images.
        this.isVisible.set(entry.isIntersecting);

      });
    }, {
      // Load/unload buffer of 600px above and below the viewport
      rootMargin: '600px'
    });

    this.observer.observe(this.el.nativeElement);
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
