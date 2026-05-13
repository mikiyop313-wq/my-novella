import { Component, input, output, signal, effect, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-index-scroll',
  standalone: true,
  template: `
    <div class="index-scroll-container">
      @for (item of items(); track item; let last = $last) {
        <button class="index-item" [class.active]="activeItem() === item" (click)="onItemClick(item)">
          {{ item }}
        </button>
        @if (!last) {
          <div class="separator"></div>
        }
      }
    </div>
  `,
  styles: [`
    .index-scroll-container {
      position: fixed;
      right: 1.5rem;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem 0.5rem;
      z-index: 100;
      max-height: 80vh;
      overflow-y: auto;
      
      /* Hide scrollbar */
      -ms-overflow-style: none;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }

    .separator {
      width: 2px;
      height: 10px;
      background-color: var(--color-text-secondary);
      opacity: 0.2;
      margin: 0 auto;
      border-radius: 2px;
      pointer-events: none;
      user-select: none;
    }

    .index-item {
      background: none;
      border: none;
      color: var(--color-text-secondary);
      font-size: 0.9rem;
      font-weight: 600;
      padding: 0.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        color: var(--color-primary);
        transform: scale(1.2);
      }

      &.active {
        color: var(--color-primary);
        transform: scale(1.2);
      }
    }
  `]
})
export class IndexScrollComponent implements OnDestroy {
  items = input.required<string[]>();
  select = output<string>();
  activeItem = signal<string | null>(null);

  private observer: IntersectionObserver | null = null;
  private visibleSections = new Set<string>();
  private isClickScrolling = false;
  private clickScrollTimeout: any;

  constructor() {
    effect(() => {
      const currentItems = this.items();
      // Setup observer in timeout to ensure DOM elements exist
      setTimeout(() => this.setupObserver(currentItems), 100);
    });
  }

  onItemClick(item: string) {
    this.activeItem.set(item);
    this.select.emit(item);

    this.isClickScrolling = true;
    clearTimeout(this.clickScrollTimeout);
    this.clickScrollTimeout = setTimeout(() => {
      this.isClickScrolling = false;
    }, 1000); // Suspend observer updates while smooth scrolling
  }

  private setupObserver(items: string[]) {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.visibleSections.clear();

    this.observer = new IntersectionObserver((entries) => {
      if (this.isClickScrolling) return;

      let changed = false;
      entries.forEach(entry => {
        const id = entry.target.id;
        const item = id.replace('section-', '');
        
        if (entry.isIntersecting) {
          if (!this.visibleSections.has(item)) changed = true;
          this.visibleSections.add(item);
        } else {
          if (this.visibleSections.has(item)) changed = true;
          this.visibleSections.delete(item);
        }
      });

      if (changed) {
        this.updateActiveItem();
      }
    }, {
      // Observe a generous portion of the screen
      rootMargin: '-50px 0px -20% 0px'
    });

    items.forEach(item => {
      const el = document.getElementById(`section-${item}`);
      if (el) {
        this.observer!.observe(el);
      }
    });
  }

  private updateActiveItem() {
    if (this.visibleSections.size === 0) return;

    const currentItems = this.items();
    let bestItem: string | null = null;
    let minDistance = Infinity;

    // The Y coordinate where we consider an item to be the primary focus
    const focusY = 120;

    for (const item of currentItems) {
      if (this.visibleSections.has(item)) {
        const el = document.getElementById(`section-${item}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          
          // If the element spans across our focus line, it's definitely the active one
          if (rect.top <= focusY && rect.bottom > focusY) {
            bestItem = item;
            break;
          }
          
          // Otherwise find the one whose top is closest to the focus line
          const distance = Math.abs(rect.top - focusY);
          if (distance < minDistance) {
            minDistance = distance;
            bestItem = item;
          }
        }
      }
    }

    if (bestItem) {
      this.activeItem.set(bestItem);
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    clearTimeout(this.clickScrollTimeout);
  }
}
