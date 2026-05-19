import { Component, signal, computed, inject, OnInit, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { AutocompleteDropdownComponent, DropdownOption } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { LibraryStore } from '../../../library/store/book.store';
import { InfoIconComponent } from '../../../../shared/components/info-icon/info-icon.component';
import { INFO_MESSAGES } from '../../../../shared/constants/info-messages';

@Component({
  selector: 'app-ai-prompt-settings',
  standalone: true,
  imports: [CommonModule, OverlayModalDirective, AutocompleteDropdownComponent, InfoIconComponent],
  templateUrl: './ai-prompt-settings.component.html',
  styleUrl: './ai-prompt-settings.component.scss'
})
export class AiPromptSettingsComponent implements OnInit {
  wordCount = input<number>(500);
  pov = input<string>('global');
  povCharacter = input<string | null>(null);
  vectorSearch = input<string>('global');

  wordCountChange = output<number>();
  povChange = output<string>();
  povCharacterChange = output<string | null>();
  vectorSearchChange = output<string>();
  reset = output<void>();

  private route = inject(ActivatedRoute);
  private libraryStore = inject(LibraryStore);

  bookId = signal<string | null>(null);
  characters = signal<DropdownOption[]>([]); // Empty state by default

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const id = params['bookId'];
      this.bookId.set(id || null);
      if (id) {
        this.libraryStore.loadBooks();
      }
    });
  }

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
}
