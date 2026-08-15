import { Component, computed, output, signal } from '@angular/core';

import type { CodexEntryType } from '../../../../../../shared/models/codex.model';

interface DetectedCodexEntry {
  name: string;
  type: CodexEntryType;
  description: string;
}

const MOCK_DETECTED_ENTRIES: readonly DetectedCodexEntry[] = [
  {
    name: 'Elara Voss',
    type: 'character',
    description: 'A guarded cartographer who carries a brass compass that points toward forgotten places. Elara learned to read coastlines from her father, but abandoned the royal survey after discovering that entire villages had been deliberately erased from its maps. She speaks carefully, remembers every road she has traveled, and distrusts anyone who treats history as settled fact. Although she presents herself as practical and detached, she is quietly driven by the hope that one of the missing roads will lead her back to the brother she lost during the northern expedition.',
  },
  {
    name: 'The Glass Harbor',
    type: 'location',
    description: 'A storm-battered port whose translucent cliffs glow blue beneath the moonlight. The harbor was carved into a ring of volcanic glass, leaving narrow passages that sing whenever the tide rises. Merchants arrive only during the calm season, when lanterns can be seen beneath the water and the old lighthouse briefly begins working without a keeper. Local families build their homes into the cliff face and mark every doorway with silver chalk to ward off the voices carried through the stone. Beneath the eastern quay lies a sealed customs tunnel that predates the city and appears on no surviving chart.',
  },
  {
    name: 'The Ashen Key',
    type: 'object',
    description: 'An iron key warm to the touch, rumored to unlock doors that no longer exist. Its bow is shaped like a branching flame, while its teeth subtly change whenever nobody is looking directly at them. The key leaves a dusting of gray ash on every surface except human skin. According to an old monastery ledger, it belonged to an architect who designed hidden rooms for the last queen and later removed those rooms from the palace itself. Turning it in an ordinary lock produces no effect, but holding it near a bricked doorway reveals the faint sound of movement on the other side.',
  },
];

const ENTRY_TYPE_LABELS: Record<CodexEntryType, string> = {
  character: 'Character',
  location: 'Location',
  object: 'Object',
  lore: 'Lore',
  subplot: 'Subplot',
  other: 'Other',
};

@Component({
  selector: 'app-codex-detection-modal',
  standalone: true,
  templateUrl: './codex-detection-modal.component.html',
  styleUrl: './codex-detection-modal.component.scss',
})
export class CodexDetectionModalComponent {
  readonly close = output<void>();

  readonly entries = signal<DetectedCodexEntry[]>([...MOCK_DETECTED_ENTRIES]);
  readonly currentIndex = signal(0);
  readonly currentEntry = computed(() => this.entries()[this.currentIndex()] ?? null);
  readonly currentTypeLabel = computed(() => {
    const entry = this.currentEntry();
    return entry ? ENTRY_TYPE_LABELS[entry.type] : '';
  });
  readonly transitionDirection = signal<'next' | 'previous' | null>(null);
  readonly animationVariation = signal<'a' | 'b'>('a');
  readonly entryAnimationClass = computed(() => {
    const direction = this.transitionDirection();
    if (!direction) return '';

    return `slide-${direction}-${this.animationVariation()}`;
  });

  previous(): void {
    if (this.currentIndex() === 0) return;

    this.prepareTransition('previous');
    this.currentIndex.update(index => index - 1);
  }

  next(): void {
    if (this.currentIndex() >= this.entries().length - 1) return;

    this.prepareTransition('next');
    this.currentIndex.update(index => index + 1);
  }

  discard(): void {
    this.removeCurrentEntry();
  }

  addToCodex(): void {
    this.removeCurrentEntry();
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
