import { Component, Output, EventEmitter, signal, ViewChild, ElementRef } from '@angular/core';
import { CdkAccordionItem, CdkAccordionModule } from '@angular/cdk/accordion';

@Component({
  selector: 'app-book-modal',
  standalone: true,
  imports: [CdkAccordionModule],
  templateUrl: './book-modal.component.html',
  styleUrl: './book-modal.component.scss'
})
export class BookModalComponent {
  @Output() close = new EventEmitter<void>();
  @ViewChild('genresContent') chipsContent!: ElementRef;

  genresExpanded = signal(false);

  targetChapters = 24;
  targetWords = 84201;

  currentCount = signal(0);
  currentWords = signal(0);

  isGenresOverflow = signal(false);
  private observer?: ResizeObserver;


  ngAfterViewInit() {
    this.observer = new ResizeObserver(() => this.checkGenresOverflow());
    this.observer.observe(this.chipsContent.nativeElement);
  }

  ngOnInit() {
    this.animateCount(1000);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private checkGenresOverflow() {
    const element = this.chipsContent.nativeElement;
    const style = window.getComputedStyle(element);
    const collapsedHeight = parseInt(style.getPropertyValue('--chips-collapsed-height')) || 96;
    
    // We check if the scrollHeight (total content height) is greater than the 
    // collapsed threshold. This value remains stable during the transition.
    const hasOverflow = element.scrollHeight > collapsedHeight;
    
    this.isGenresOverflow.set(hasOverflow);
  }

  private animateCount(duration: number) {
    const startTime = performance.now();

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out expo function
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -12 * progress);

      this.currentCount.set(Math.floor(easeProgress * this.targetChapters));
      this.currentWords.set(Math.floor(easeProgress * this.targetWords));

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }

  formatNumber(val: number): string {
    return new Intl.NumberFormat().format(val);
  }

  onToggleGenres(accordionItem: CdkAccordionItem) {
    this.genresExpanded.set(!accordionItem.expanded);
    accordionItem.toggle();
  }

  onClose() {
    this.close.emit();
  }
}
