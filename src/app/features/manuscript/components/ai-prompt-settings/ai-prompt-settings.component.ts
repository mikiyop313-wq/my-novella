import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';

import type { AiReasoningEffort } from '../../../../../../shared/models/ai.model';
import {
  AutocompleteDropdownComponent,
  AutocompleteDropdownTriggerDirective,
  DropdownOption,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import type { VectorSearchSetting } from '../../../../shared/models/vector-search.model';
import { LibraryStore } from '../../../library/store/book.store';
import { AiStore } from '../../../../core/store/ai.store';
import { CodexService } from '../../../codex/services/codex.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';

type CharacterLoadState = 'idle' | 'loading' | 'loaded' | 'error';

const REASONING_EFFORT_OPTIONS: readonly DropdownOption<AiReasoningEffort>[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

@Component({
  selector: 'app-ai-prompt-settings',
  standalone: true,
  imports: [
    CommonModule,
    OverlayModalDirective,
    AutocompleteDropdownComponent,
    AutocompleteDropdownTriggerDirective,
    InfoIconComponent,
  ],
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
  vectorSearch = input<VectorSearchSetting>('global');
  selectedModel = input<string | null>(null);
  reasoningMode = input<boolean>(false);
  reasoningEffort = input<AiReasoningEffort>('medium');

  wordCountChange = output<number>();
  povChange = output<string>();
  povCharacterChange = output<string | null>();
  vectorSearchChange = output<VectorSearchSetting>();
  reasoningModeChange = output<boolean>();
  reasoningEffortChange = output<AiReasoningEffort>();
  reset = output<void>();


  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly libraryStore = inject(LibraryStore);
  private readonly aiStore = inject(AiStore);
  private readonly codexService = inject(CodexService);


  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  /** Resolved metadata is absent while model selection or loading is incomplete. */
  private readonly selectedModelMetadata = computed(() => {
    const modelId = this.selectedModel();
    if (!modelId) return undefined;

    return this.aiStore.models().find((model) => model.id === modelId);
  });

  /** The IPC layer provides reasoning support, so the UI does no model-name guessing. */
  supportsReasoning = computed(
    () => this.selectedModelMetadata()?.supportsReasoning === true,
  );

  bookId = computed(() => this.workspaceStore.bookId());

  characters = signal<DropdownOption<string>[]>([]);
  characterLoadState = signal<CharacterLoadState>('idle');

  povCharacterOptions = computed<DropdownOption<string | null>[]>(() => [
    { value: null, label: 'None' },
    ...this.characters(),
  ]);

  characterEmptyText = computed(() => {
    switch (this.characterLoadState()) {
      case 'loading':
        return 'Loading characters...';
      case 'error':
        return 'Unable to load characters.';
      default:
        return 'No characters in Codex.';
    }
  });

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

  globalVectorSearchEnabled = computed(
    () => this.activeBook()?.settings?.vectorSearchEnabled ?? true,
  );

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
  readonly reasoningEffortOptions = REASONING_EFFORT_OPTIONS;
  readonly reasoningEffortLabel = computed(() => {
    switch (this.reasoningEffort()) {
      case 'low':
        return 'Low';
      case 'high':
        return 'High';
      default:
        return 'Medium';
    }
  });
  private characterLoadRequestId = 0;


  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    effect(() => {
      const id = this.workspaceStore.bookId();

      this.characterLoadRequestId++;
      this.characters.set([]);
      this.characterLoadState.set('idle');

      if (id) {
        this.libraryStore.loadBooks();
      }
    });

    // Keep persisted prompt settings valid when the user changes model.
    effect(() => {
      const selectedModel = this.selectedModelMetadata();
      if (selectedModel && !selectedModel.supportsReasoning && this.reasoningMode()) {
        this.reasoningModeChange.emit(false);
      }
    });
  }


  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  async loadPovCharacters(): Promise<void> {
    const requestId = ++this.characterLoadRequestId;
    const bookId = this.bookId();

    this.characters.set([]);

    if (!bookId) {
      this.characterLoadState.set('loaded');
      return;
    }

    this.characterLoadState.set('loading');

    try {
      const characters = await this.codexService.getEntries(bookId, {
        type: 'character',
        status: 'active',
      });

      if (requestId !== this.characterLoadRequestId || bookId !== this.bookId()) return;

      this.characters.set(characters.map(character => ({
        value: character.id,
        label: character.name,
      })));
      this.characterLoadState.set('loaded');
    } catch {
      if (requestId !== this.characterLoadRequestId || bookId !== this.bookId()) return;

      this.characters.set([]);
      this.characterLoadState.set('error');
    }
  }

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

    this.vectorSearchChange.emit(
      target.checked
        ? 'global'
        : this.globalVectorSearchEnabled() ? 'enabled' : 'disabled',
    );
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

  onReasoningEffortChange(value: AiReasoningEffort): void {
    this.reasoningEffortChange.emit(value);
  }
}
