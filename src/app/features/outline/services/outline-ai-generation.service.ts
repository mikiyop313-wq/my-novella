import { Injectable, signal } from '@angular/core';

export interface OutlineAiTarget {
  bookId: string;
  sceneId: string;
}

@Injectable({ providedIn: 'root' })
export class OutlineAiGenerationService {
  readonly summaryTarget = signal<OutlineAiTarget | null>(null);
  readonly codexDetectionTarget = signal<OutlineAiTarget | null>(null);
}
