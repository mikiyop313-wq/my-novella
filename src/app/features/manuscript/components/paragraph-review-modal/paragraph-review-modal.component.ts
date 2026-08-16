import { Component, computed, effect, input, output, signal } from '@angular/core';

import type { SimilarParagraphResult } from '../../../../../../shared/models/vector.model';
import type { ParagraphReviewItem } from '../../helpers/ai/paragraph-review.service';

@Component({
  selector: 'app-paragraph-review-modal',
  standalone: true,
  templateUrl: './paragraph-review-modal.component.html',
  styleUrl: './paragraph-review-modal.component.scss',
})
export class ParagraphReviewModalComponent {
  readonly reviewItems = input.required<readonly ParagraphReviewItem[]>();
  readonly accepted = output<SimilarParagraphResult>();
  readonly close = output<void>();

  readonly items = signal<ParagraphReviewItem[]>([]);
  readonly currentIndex = signal(0);
  readonly currentItem = computed(() => this.items()[this.currentIndex()] ?? null);
  readonly transitionDirection = signal<'next' | 'previous' | null>(null);
  readonly animationVariation = signal<'a' | 'b'>('a');
  readonly itemAnimationClass = computed(() => {
    const direction = this.transitionDirection();
    return direction ? `slide-${direction}-${this.animationVariation()}` : '';
  });

  constructor() {
    effect(() => {
      this.items.set([...this.reviewItems()]);
      this.currentIndex.set(0);
    });
  }

  previous(): void {
    if (this.currentIndex() === 0) return;
    this.prepareTransition('previous');
    this.currentIndex.update(index => index - 1);
  }

  next(): void {
    if (this.currentIndex() >= this.items().length - 1) return;
    this.prepareTransition('next');
    this.currentIndex.update(index => index + 1);
  }

  reject(): void {
    this.removeCurrentItem();
  }

  accept(): void {
    const item = this.currentItem();
    if (!item) return;
    this.accepted.emit(item.result);
    this.removeCurrentItem();
  }

  private removeCurrentItem(): void {
    const index = this.currentIndex();
    const remainingItems = this.items().filter((_, itemIndex) => itemIndex !== index);
    if (remainingItems.length === 0) {
      this.items.set([]);
      this.close.emit();
      return;
    }

    this.prepareTransition(index < remainingItems.length ? 'next' : 'previous');
    this.items.set(remainingItems);
    this.currentIndex.set(Math.min(index, remainingItems.length - 1));
  }

  private prepareTransition(direction: 'next' | 'previous'): void {
    this.transitionDirection.set(direction);
    this.animationVariation.update(variation => variation === 'a' ? 'b' : 'a');
  }
}
