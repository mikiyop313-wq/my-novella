import { Injectable, signal } from '@angular/core';

import type { DetectedCodexEntryDto } from '../../../../../shared/models/codex.model';

export interface PendingCodexDetection {
  bookId: string;
  entries: readonly DetectedCodexEntryDto[];
}

@Injectable({ providedIn: 'root' })
export class CodexDetectionStateService {
  readonly pendingDetection = signal<PendingCodexDetection | null>(null);

  clearPendingDetection(): void {
    this.pendingDetection.set(null);
  }
}
