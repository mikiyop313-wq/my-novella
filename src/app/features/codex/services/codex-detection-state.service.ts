import { Injectable, computed, signal } from '@angular/core';

import type { DetectedCodexEntryDto } from '../../../../../shared/models/codex.model';

export interface PendingCodexDetection {
  bookId: string;
  sceneId: string;
  entries: readonly DetectedCodexEntryDto[];
}

@Injectable({ providedIn: 'root' })
export class CodexDetectionStateService {
  readonly activeDetections = signal<ReadonlyMap<string, PendingCodexDetection>>(new Map());
  readonly queuedDetections = signal<readonly PendingCodexDetection[]>([]);
  readonly pendingDetections = computed(() => [
    ...this.activeDetections().values(),
    ...this.queuedDetections(),
  ]);

  activeDetection(bookId: string | null): PendingCodexDetection | null {
    return bookId ? this.activeDetections().get(bookId) ?? null : null;
  }

  hasPendingDetection({ bookId, sceneId }: { bookId: string; sceneId: string }): boolean {
    return this.pendingDetections().some(detection => (
      detection.bookId === bookId && detection.sceneId === sceneId
    ));
  }

  enqueue(detection: PendingCodexDetection): boolean {
    if (this.hasPendingDetection(detection)) return false;

    const bookHasPendingDetection = this.activeDetections().has(detection.bookId)
      || this.queuedDetections().some(candidate => candidate.bookId === detection.bookId);
    if (bookHasPendingDetection) {
      this.queuedDetections.update(detections => [...detections, detection]);
      return true;
    }

    this.setActive(detection);
    return true;
  }

  completeActive(detection: PendingCodexDetection): boolean {
    if (this.activeDetections().get(detection.bookId) !== detection) return false;

    this.activeDetections.update(detections => {
      const nextDetections = new Map(detections);
      nextDetections.delete(detection.bookId);
      return nextDetections;
    });
    return true;
  }

  nextQueued(bookId: string): PendingCodexDetection | null {
    return this.queuedDetections().find(detection => detection.bookId === bookId) ?? null;
  }

  activateQueued(
    queuedDetection: PendingCodexDetection,
    entries: readonly DetectedCodexEntryDto[],
  ): boolean {
    if (this.nextQueued(queuedDetection.bookId) !== queuedDetection) return false;

    this.removeQueued(queuedDetection);
    this.setActive({ ...queuedDetection, entries });
    return true;
  }

  discardQueued(queuedDetection: PendingCodexDetection): boolean {
    if (this.nextQueued(queuedDetection.bookId) !== queuedDetection) return false;

    this.removeQueued(queuedDetection);
    return true;
  }

  private setActive(detection: PendingCodexDetection): void {
    this.activeDetections.update(detections => (
      new Map(detections).set(detection.bookId, detection)
    ));
  }

  private removeQueued(detection: PendingCodexDetection): void {
    this.queuedDetections.update(detections => detections.filter(candidate => candidate !== detection));
  }
}
