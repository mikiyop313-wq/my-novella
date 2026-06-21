import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';

import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { LibraryStore } from '../../../library/store/book.store';
import { AiStore } from '../../../../core/store/ai.store';
import { ManuscriptStore } from '../../store/manuscript.store';

@Component({
  selector: 'app-ai-prompt-settings',
  standalone: true,
  imports: [CommonModule, OverlayModalDirective, AutocompleteDropdownComponent, InfoIconComponent],
  templateUrl: './ai-prompt-settings.component.html',
  styleUrl: './ai-prompt-settings.component.scss'
})
export class AiPromptSettingsComponent {

  // ---------------------------------------------------------------------------
  // Inputs / Outputs
  // ---------------------------------------------------------------------------

  wordCount = input<number>(500);
  pov = input<string>('global');
  povCharacter = input<string | null>(null);
  vectorSearch = input<string>('global');
  selectedModel = input<string | null>(null);
  reasoningMode = input<boolean>(false);

  wordCountChange = output<number>();
  povChange = output<string>();
  povCharacterChange = output<string | null>();
  vectorSearchChange = output<string>();
  reasoningModeChange = output<boolean>();
  reset = output<void>();


  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly store = inject(ManuscriptStore);
  private readonly libraryStore = inject(LibraryStore);
  private readonly aiStore = inject(AiStore);


  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  /**
   * Whether the selected model supports reasoning/thinking tokens.
   * The IPC layer provides this metadata, so the UI does no model-name guessing.
   */
  supportsReasoning = computed(() => {
    const modelId = this.selectedModel();
    if (!modelId) return false;

    const model = this.aiStore.models().find((m: any) => m.id === modelId);
    return model?.supportsReasoning === true;
  });

  bookId = computed(() => this.store.bookId());

  characters = signal<DropdownOption[]>([]);

  activeBook = computed(() => {
    const id = this.bookId();
    if (!id) return null;

    return this.libraryStore.books().find(b => b.id === id) || null;
  });

  globalPOVLabel = computed(() => {
    const book = this.activeBook();
    const pov = book?.settings?.pointOfView;

    if (!pov) return 'Third Person Limited';

    const map: Record<string, string> = {
      first: 'First Person',
      second: 'Second Person',
      third_limited: 'Third Person Limited',
      third_omni: 'Third Person Omniscient',
    };

    return map[pov] || 'Third Person Limited';
  });

  povOptions = computed<DropdownOption[]>(() => {
    const globalLabel = this.globalPOVLabel();

    return [
      { value: 'global', label: `Use Global Setting (${globalLabel})` },
      { value: 'first', label: 'First Person' },
      { value: 'second', label: 'Second Person' },
      { value: 'third_limited', label: 'Third Person Limited' },
      { value: 'third_omni', label: 'Third Person Omniscient' },
    ];
  });

  readonly INFO = INFO_MESSAGES.AI_PROMPT;


  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    effect(() => {
      const id = this.store.bookId();
      if (id) {
        this.libraryStore.loadBooks();
      }
    });

    // Keep persisted prompt settings valid when the user changes model.
    effect(() => {
      if (!this.supportsReasoning() && this.reasoningMode()) {
        this.reasoningModeChange.emit(false);
      }
    });
  }


  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  onWordCountPresetSelect(value: number): void {
    this.wordCountChange.emit(value);
  }

  onCustomWordCountInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);

    if (!isNaN(value) && value >= 0) {
      this.wordCountChange.emit(value);
    }
  }

  onPOVSelectionChange(value: string): void {
    this.povChange.emit(value);
  }

  onPovCharacterSelectionChange(value: string | null): void {
    this.povCharacterChange.emit(value);
  }

  onInheritVectorSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;

    this.vectorSearchChange.emit(target.checked ? 'global' : 'enabled');
  }

  onVectorSearchToggleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.vectorSearchChange.emit(target.checked ? 'enabled' : 'disabled');
  }

  onReset(): void {
    this.reset.emit();
  }

  onReasoningModeToggleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.reasoningModeChange.emit(target.checked);
  }
}
