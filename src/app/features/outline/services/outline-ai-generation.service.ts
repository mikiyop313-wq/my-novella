import { Injectable, signal } from '@angular/core';

export interface OutlineAiTarget {
  bookId: string;
  sceneId: string;
}

export interface OutlineAiSummaryTarget extends OutlineAiTarget {
  streamId: string;
}

@Injectable({ providedIn: 'root' })
export class OutlineAiGenerationService {
  readonly summaryTargets = signal<ReadonlyMap<string, OutlineAiSummaryTarget>>(new Map());
  readonly codexDetectionTarget = signal<OutlineAiTarget | null>(null);

  isSummaryTargetActive({
    bookId,
    sceneId,
  }: Pick<OutlineAiTarget, 'bookId' | 'sceneId'>): boolean {
    return this.summaryTargets().has(this.summaryTargetKey({ bookId, sceneId }));
  }

  addSummaryTarget(target: OutlineAiSummaryTarget): boolean {
    const key = this.summaryTargetKey(target);
    if (this.summaryTargets().has(key)) return false;

    this.summaryTargets.update(targets => new Map(targets).set(key, target));
    return true;
  }

  removeSummaryTarget(target: OutlineAiSummaryTarget): void {
    const key = this.summaryTargetKey(target);
    if (this.summaryTargets().get(key)?.streamId !== target.streamId) return;

    this.summaryTargets.update(targets => {
      const nextTargets = new Map(targets);
      nextTargets.delete(key);
      return nextTargets;
    });
  }

  private summaryTargetKey({
    bookId,
    sceneId,
  }: Pick<OutlineAiTarget, 'bookId' | 'sceneId'>): string {
    return `${bookId}:${sceneId}`;
  }
}
