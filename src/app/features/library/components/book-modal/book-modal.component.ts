import { Component, Output, EventEmitter, signal, ViewChild, ElementRef, Input, computed } from '@angular/core';
import { CdkAccordionItem, CdkAccordionModule } from '@angular/cdk/accordion';
import { BookDto } from '../../../../../../shared/models/book.model';
import { CommonModule } from '@angular/common';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-book-modal',
  standalone: true,
  imports: [CdkAccordionModule, CommonModule, TimeAgoPipe],
  templateUrl: './book-modal.component.html',
  styleUrl: './book-modal.component.scss'
})
export class BookModalComponent {
  @Input({ required: true }) book!: BookDto;
  @Output() close = new EventEmitter<void>();

  @ViewChild('genresContent') genresContent!: ElementRef;
  @ViewChild('tropesContent') tropesContent!: ElementRef;

  genresExpanded = signal(false);
  tropesExpanded = signal(false);

  genres = computed(() => this.book.categories?.filter(c => c.type === 'genre') || []);
  tropes = computed(() => this.book.categories?.filter(c => c.type === 'trope') || []);

  currentWords = signal(0);
  currentCount = signal(0); // This could be chapters if we add them to schema

  isGenresOverflow = signal(false);
  isTropesOverflow = signal(false);
  private observer?: ResizeObserver;


  ngAfterViewInit() {
    this.observer = new ResizeObserver(() => {
      this.checkOverflow('genres');
      this.checkOverflow('tropes');
    });

    if (this.genresContent) this.observer.observe(this.genresContent.nativeElement);
    if (this.tropesContent) this.observer.observe(this.tropesContent.nativeElement);
  }

  ngOnInit() {
    this.animateCount(1000);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private checkOverflow(type: 'genres' | 'tropes') {
    const element = type === 'genres' ? this.genresContent?.nativeElement : this.tropesContent?.nativeElement;
    if (!element) return;

    const style = window.getComputedStyle(element);
    const collapsedHeight = parseInt(style.getPropertyValue('--chips-collapsed-height')) || 96;

    const hasOverflow = element.scrollHeight > collapsedHeight;

    if (type === 'genres') {
      this.isGenresOverflow.set(hasOverflow);
    } else {
      this.isTropesOverflow.set(hasOverflow);
    }
  }

  private animateCount(duration: number) {
    const startTime = performance.now();
    const targetWords = this.book.wordCount || 0;
    const targetChapters = 0; // Placeholder until chapters are in schema

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out expo function
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -12 * progress);

      this.currentWords.set(Math.floor(easeProgress * targetWords));
      this.currentCount.set(Math.floor(easeProgress * targetChapters));

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  formatNumber(val: number): string {
    return new Intl.NumberFormat().format(val);
  }

  getReadingTime(): string {
    const words = this.book.wordCount || 0;
    const minutes = Math.ceil(words / 250);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  onToggleGenres(accordionItem: CdkAccordionItem) {
    this.genresExpanded.set(!accordionItem.expanded);
    accordionItem.toggle();
  }

  onToggleTropes(accordionItem: CdkAccordionItem) {
    this.tropesExpanded.set(!accordionItem.expanded);
    accordionItem.toggle();
  }

  onClose() {
    this.close.emit();
  }
}
