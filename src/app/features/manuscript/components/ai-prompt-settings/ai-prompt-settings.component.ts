import { Component, signal, computed, inject, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { LibraryStore } from '../../../library/store/book.store';
import { ManuscriptStore } from '../../store/manuscript.store';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';
import { AiStore } from '../../store/ai.store';

@Component({
  selector: 'app-ai-prompt-settings',
  standalone: true,
  imports: [CommonModule, OverlayModalDirective, AutocompleteDropdownComponent, InfoIconComponent],
  templateUrl: './ai-prompt-settings.component.html',
  styleUrl: './ai-prompt-settings.component.scss'
})
export class AiPromptSettingsComponent {
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

  private store = inject(ManuscriptStore);
  private libraryStore = inject(LibraryStore);
  private aiStore = inject(AiStore);

  /**
   * Whether the currently selected model supports reasoning/thinking mode.
   * Determined at the IPC layer by checking supported_parameters from the
   * OpenRouter API response — no client-side heuristics needed.
   */
  supportsReasoning = computed(() => {
    const modelId = this.selectedModel();
    if (!modelId) return false;
    const model = this.aiStore.models().find((m: any) => m.id === modelId);
    return model?.supportsReasoning === true;
  });

  bookId = computed(() => this.store.bookId());
  characters = signal<DropdownOption[]>([]); // Empty state by default

  activeBook = computed(() => {
    const id = this.bookId();
    if (!id) return null;
    return this.libraryStore.books().find(b => b.id === id) || null;
  });

  constructor() {
    effect(() => {
      const id = this.store.bookId();
      if (id) {
        this.libraryStore.loadBooks();
      }
    });

    // When the model changes to one that doesn't support reasoning,
    // automatically turn off reasoning mode.
    effect(() => {
      if (!this.supportsReasoning() && this.reasoningMode()) {
        this.reasoningModeChange.emit(false);
      }
    });
  }

  globalPOVLabel = computed(() => {
    const book = this.activeBook();
    const pov = book?.settings?.pointOfView;
    if (!pov) return 'Third Person Limited';
    const map: Record<string, string> = {
      'first': 'First Person',
      'second': 'Second Person',
      'third_limited': 'Third Person Limited',
      'third_omni': 'Third Person Omniscient'
    };
    return map[pov] || 'Third Person Limited';
  });

  // Build dynamic options using the computed global POV label
  povOptions = computed<DropdownOption[]>(() => {
    const globalLabel = this.globalPOVLabel();
    return [
      { value: 'global', label: `Use Global Setting (${globalLabel})` },
      { value: 'first', label: 'First Person' },
      { value: 'second', label: 'Second Person' },
      { value: 'third_limited', label: 'Third Person Limited' },
      { value: 'third_omni', label: 'Third Person Omniscient' }
    ];
  });

  readonly INFO = INFO_MESSAGES.AI_PROMPT;

  onWordCountPresetSelect(val: number) {
    this.wordCountChange.emit(val);
  }

  onCustomWordCountInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    if (!isNaN(val) && val >= 0) {
      this.wordCountChange.emit(val);
    }
  }

  onPOVSelectionChange(value: string) {
    this.povChange.emit(value);
  }

  onPovCharacterSelectionChange(value: string | null) {
    this.povCharacterChange.emit(value);
  }

  onInheritVectorSearchChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
      this.vectorSearchChange.emit('global');
    } else {
      this.vectorSearchChange.emit('enabled');
    }
  }

  onVectorSearchToggleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.vectorSearchChange.emit(target.checked ? 'enabled' : 'disabled');
  }

  onReset() {
    this.reset.emit();
  }

  onReasoningModeToggleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.reasoningModeChange.emit(target.checked);
  }
}
