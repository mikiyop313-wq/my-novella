import { Component, computed, effect, input, output, signal } from '@angular/core';

import type {
  CodexEntryType,
  DetectedCodexEntryDto,
} from '../../../../../../shared/models/codex.model';

const ENTRY_TYPE_LABELS: Record<CodexEntryType, string> = {
  character: 'Character',
  location: 'Location',
  object: 'Object',
  lore: 'Lore',
  subplot: 'Subplot',
  other: 'Other',
};

export type CodexDetectionSaveResult =
  | { success: true }
  | { success: false; error: string };

@Component({
  selector: 'app-codex-detection-modal',
  standalone: true,
  templateUrl: './codex-detection-modal.component.html',
  styleUrl: './codex-detection-modal.component.scss',
})
export class CodexDetectionModalComponent {
  readonly detectedEntries = input.required<readonly DetectedCodexEntryDto[]>();
  readonly saveEntry = input.required<
    (entry: DetectedCodexEntryDto) => Promise<CodexDetectionSaveResult>
  >();
  readonly close = output<void>();

  readonly entries = signal<DetectedCodexEntryDto[]>([]);
  readonly currentIndex = signal(0);
  readonly currentEntry = computed(() => this.entries()[this.currentIndex()] ?? null);
  readonly currentTypeLabel = computed(() => {
    const entry = this.currentEntry();
    return entry ? ENTRY_TYPE_LABELS[entry.type] : '';
  });
  readonly transitionDirection = signal<'next' | 'previous' | null>(null);
  readonly animationVariation = signal<'a' | 'b'>('a');
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly entryAnimationClass = computed(() => {
    const direction = this.transitionDirection();
    if (!direction) return '';

    return `slide-${direction}-${this.animationVariation()}`;
  });

  constructor() {
    effect(() => {
      this.entries.set([...this.detectedEntries()]);
      this.currentIndex.set(0);
      this.saveError.set(null);
    });
  }

  previous(): void {
    if (this.currentIndex() === 0) return;

    this.saveError.set(null);
    this.prepareTransition('previous');
    this.currentIndex.update(index => index - 1);
  }

  next(): void {
    if (this.currentIndex() >= this.entries().length - 1) return;

    this.saveError.set(null);
    this.prepareTransition('next');
    this.currentIndex.update(index => index + 1);
  }

  discard(): void {
    this.saveError.set(null);
    this.removeCurrentEntry();
  }

  async addToCodex(): Promise<void> {
    const entry = this.currentEntry();
    if (!entry || this.saving()) return;

    this.saveError.set(null);
    this.saving.set(true);
    try {
      const result = await this.saveEntry()(entry);
      if (result.success) {
        this.removeCurrentEntry();
      } else {
        this.saveError.set(result.error);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private removeCurrentEntry(): void {
    const index = this.currentIndex();
    const remainingEntries = this.entries().filter((_, entryIndex) => entryIndex !== index);

    if (remainingEntries.length === 0) {
      this.entries.set(remainingEntries);
      this.close.emit();
      return;
    }

    this.prepareTransition(index < remainingEntries.length ? 'next' : 'previous');
    this.entries.set(remainingEntries);
    this.currentIndex.set(Math.min(index, remainingEntries.length - 1));
  }

  private prepareTransition(direction: 'next' | 'previous'): void {
    this.transitionDirection.set(direction);
    this.animationVariation.update(variation => variation === 'a' ? 'b' : 'a');
  }
}
