import { Injectable, signal } from '@angular/core';

import type { SimilarParagraphResult } from '../../../../../../shared/models/vector.model';

export interface ParagraphReviewItem {
  result: SimilarParagraphResult;
  location: string;
}

export interface PendingParagraphReview {
  id: string;
  items: readonly ParagraphReviewItem[];
}

@Injectable({ providedIn: 'root' })
export class ParagraphReviewService {
  readonly activeReview = signal<PendingParagraphReview | null>(null);

  private acceptedParagraphIds = new Set<string>();
  private resolveReview: ((results: SimilarParagraphResult[]) => void) | null = null;

  review(items: readonly ParagraphReviewItem[]): Promise<SimilarParagraphResult[]> {
    if (items.length === 0) return Promise.resolve([]);
    if (this.activeReview()) {
      throw new Error('A paragraph review is already active.');
    }

    this.acceptedParagraphIds.clear();
    this.activeReview.set({ id: crypto.randomUUID(), items: [...items] });
    return new Promise(resolve => {
      this.resolveReview = resolve;
    });
  }

  accept(result: SimilarParagraphResult): void {
    const review = this.activeReview();
    if (!review?.items.some(item => item.result.paragraphId === result.paragraphId)) return;
    this.acceptedParagraphIds.add(result.paragraphId);
  }

  complete(): void {
    const review = this.activeReview();
    const resolve = this.resolveReview;
    if (!review || !resolve) return;

    const acceptedResults = review.items
      .map(item => item.result)
      .filter(result => this.acceptedParagraphIds.has(result.paragraphId));
    this.activeReview.set(null);
    this.acceptedParagraphIds.clear();
    this.resolveReview = null;
    resolve(acceptedResults);
  }
}
