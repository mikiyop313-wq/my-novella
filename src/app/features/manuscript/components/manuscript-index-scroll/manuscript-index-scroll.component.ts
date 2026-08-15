import { Component, input, output, signal, effect, OnDestroy, NgZone, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ManuscriptStore } from '../../store/manuscript.store';

export interface ManuscriptIndexItem {
  id: string;
  label: string;
  type: 'act' | 'chapter' | 'scene';
}

interface PositionedItem {
  item: ManuscriptIndexItem;
  topPercent: number;
}

@Component({
  selector: 'app-manuscript-index-scroll',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manuscript-index-scroll.component.html',
  styleUrl: './manuscript-index-scroll.component.scss'
})
export class ManuscriptIndexScrollComponent implements OnDestroy {
  items = input.required<ManuscriptIndexItem[]>();
  select = output<ManuscriptIndexItem>();
  
  positionedItems = signal<PositionedItem[]>([]);
  store = inject(ManuscriptStore);
  
  thumbTop = signal<number>(0);
  thumbHeight = signal<number>(0);

  private observer: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scrollContainer: HTMLElement | null = null;
  private scrollListener: any;
  private isClickScrolling = false;
  private clickScrollTimeout: any;

  constructor(private ngZone: NgZone, private elementRef: ElementRef) {
    effect(() => {
      const currentItems = this.items();
      setTimeout(() => {
        this.setupObservers(currentItems);
        this.calculatePositions();
      }, 100);
    });
  }

  onItemClick(item: ManuscriptIndexItem) {
    this.store.setActiveSection(item.type, item.id);
    this.select.emit(item);

    this.isClickScrolling = true;
    clearTimeout(this.clickScrollTimeout);
    this.clickScrollTimeout = setTimeout(() => {
      this.isClickScrolling = false;
    }, 1000);
  }

  isActive(item: ManuscriptIndexItem): boolean {
    if (item.type === 'act') return this.store.actId() === item.id;
    if (item.type === 'chapter') return this.store.chapterId() === item.id;
    if (item.type === 'scene') return this.store.sceneId() === item.id;
    return false;
  }

  private setupObservers(items: ManuscriptIndexItem[]) {
    if (this.observer) this.observer.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }

    this.scrollContainer = document.querySelector('.editor-content-wrapper') as HTMLElement;
    if (!this.scrollContainer) return;

    // Track scroll to update thumb position
    this.scrollListener = () => {
      this.updateThumbPosition();
    };
    this.scrollContainer.addEventListener('scroll', this.scrollListener, { passive: true });

    // Track resizing of editor to recalculate marker positions
    const tiptapEl = this.scrollContainer.querySelector('.tiptap');
    if (tiptapEl) {
      this.resizeObserver = new ResizeObserver(() => {
        this.ngZone.run(() => {
          this.calculatePositions();
          this.updateThumbPosition();
        });
      });
      this.resizeObserver.observe(tiptapEl);
      this.resizeObserver.observe(this.scrollContainer);
    }

    // Intersection observer to track active item
    this.observer = new IntersectionObserver((entries) => {
      if (this.isClickScrolling) return;

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          const itemId = id.replace('section-', '');
          const item = this.items().find(i => i.id === itemId);
          if (item) {
            this.store.setActiveSection(item.type, item.id);
          }
        }
      });
    }, {
      root: this.scrollContainer,
      rootMargin: '-10% 0px -80% 0px' // Trigger near top of view
    });

    items.forEach(item => {
      const el = document.getElementById(`section-${item.id}`);
      if (el) this.observer!.observe(el);
    });

    // Initial calcs
    this.calculatePositions();
    this.updateThumbPosition();
  }

  private calculatePositions() {
    if (!this.scrollContainer) return;
    
    const scrollHeight = this.scrollContainer.scrollHeight;
    if (scrollHeight === 0) return;

    const currentItems = this.items();
    const newPositioned: PositionedItem[] = [];

    // Container offset to calculate absolute top within the scroll area
    const containerTop = this.scrollContainer.getBoundingClientRect().top;
    const scrollTop = this.scrollContainer.scrollTop;

    for (const item of currentItems) {
      const el = document.getElementById(`section-${item.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Calculate the absolute Y position of the element from the top of the scroll container
        const absoluteTop = rect.top - containerTop + scrollTop;
        
        let topPercent = (absoluteTop / scrollHeight) * 100;
        // Clamp to 0-100 just in case
        topPercent = Math.max(0, Math.min(100, topPercent));

        newPositioned.push({ item, topPercent });
      }
    }

    this.positionedItems.set(newPositioned);
  }

  private updateThumbPosition() {
    if (!this.scrollContainer) return;

    const scrollTop = this.scrollContainer.scrollTop;
    const scrollHeight = this.scrollContainer.scrollHeight;
    const clientHeight = this.scrollContainer.clientHeight;

    if (scrollHeight === 0) return;

    const thumbHeightPct = (clientHeight / scrollHeight) * 100;
    const thumbTopPct = (scrollTop / scrollHeight) * 100;

    this.thumbHeight.set(Math.min(100, Math.max(2, thumbHeightPct))); // Min 2% height
    this.thumbTop.set(Math.min(100 - this.thumbHeight(), Math.max(0, thumbTopPct)));
  }

  ngOnDestroy() {
    if (this.observer) this.observer.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.scrollContainer && this.scrollListener) {
      this.scrollContainer.removeEventListener('scroll', this.scrollListener);
    }
    clearTimeout(this.clickScrollTimeout);
  }
}
