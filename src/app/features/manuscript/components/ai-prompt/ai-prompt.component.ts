import { Component, ElementRef, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { CdkMenuModule } from '@angular/cdk/menu';
import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';

@Component({
  selector: 'app-ai-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, AiPromptSettingsComponent],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {
  @ViewChild('promptInput') promptInput!: ElementRef<HTMLDivElement>;

  // Collapse and delete state/methods
  isCollapsed = signal(false);

  collapse(): void {
    this.isCollapsed.update(c => !c);
  }

  colapse(): void {
    this.collapse();
  }

  deletePrompt(): void {
    // Left empty for now
  }

  deleteComponent(): void {
    // Left empty for now
  }

  // Interactive UI states
  promptText = signal('');
  isEmpty = computed(() => {
    const text = this.promptText();
    return !text || text.trim() === '';
  });
  isFocused = signal(false);
  selectedModel = signal<string | null>(null);

  // AI Generation configuration overrides
  wordCount = signal<number>(500);
  pov = signal<string>('global');
  povCharacter = signal<string | null>(null);
  vectorSearch = signal<string>('global');

  ngOnInit(): void {
    // 1. Restore attributes from Tiptap document on load
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.promptText.set(attrs['promptText'] || '');
      this.selectedModel.set(attrs['selectedModel'] || null);
      this.wordCount.set(attrs['wordCount'] || 500);
      this.pov.set(attrs['pov'] || 'global');
      this.povCharacter.set(attrs['povCharacter'] || null);
      this.vectorSearch.set(attrs['vectorSearch'] || 'global');
    }
  }

  ngAfterViewInit(): void {
    // 2. Restore contenteditable text once view is initialized
    if (this.promptInput && this.promptText()) {
      this.promptInput.nativeElement.innerText = this.promptText();
    }
  }

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    this.isFocused.set(false);
  }

  onInput(event: Event): void {
    const target = event.target as HTMLDivElement;
    const text = target.innerText || '';
    this.promptText.set(text);

    // Sync text back to Tiptap
    this.updateAttributes()({ promptText: text });
  }

  setPromptText(text: string): void {
    this.promptText.set(text);
    if (this.promptInput) {
      this.promptInput.nativeElement.innerText = text;
    }
    // Sync text back to Tiptap
    this.updateAttributes()({ promptText: text });
  }

  // 3. Change handlers that update state and sync with Tiptap
  onWordCountChange(value: number): void {
    this.wordCount.set(value);
    this.updateAttributes()({ wordCount: value });
  }

  onPovChange(value: string): void {
    this.pov.set(value);
    this.updateAttributes()({ pov: value });
  }

  onPovCharacterChange(value: string | null): void {
    this.povCharacter.set(value);
    this.updateAttributes()({ povCharacter: value });
  }

  onVectorSearchChange(value: string): void {
    this.vectorSearch.set(value);
    this.updateAttributes()({ vectorSearch: value });
  }

  onModelChange(model: string | null): void {
    this.selectedModel.set(model);
    this.updateAttributes()({ selectedModel: model });
  }

  onSettingsReset(): void {
    this.wordCount.set(500);
    this.pov.set('global');
    this.povCharacter.set(null);
    this.vectorSearch.set('global');

    this.updateAttributes()({
      wordCount: 500,
      pov: 'global',
      povCharacter: null,
      vectorSearch: 'global'
    });
  }

  onSubmit(): void {
    const text = this.promptText().trim();
    if (text && typeof this.getPos === 'function') {
      const pos: number = this.getPos()() ?? 0;

      // In a real app, this would call an API with the settings overrides.
      const generatedText = `[AI Generated response for: "${text}" (Word count: ${this.wordCount()}, POV: ${this.pov()}, Character POV: ${this.povCharacter() || 'None'}, Vector Search: ${this.vectorSearch()})]`;

      const nodeSizePosition: number = this.node().nodeSize + pos;

      this.editor().chain().focus().insertContentAt(pos + nodeSizePosition, {
        type: 'paragraph',
        content: [{ type: 'text', text: generatedText }]
      }).run();

      // Optionally clear the text, but the user requested to keep the container
      // to resend multiple times.
    }
  }

  clearPrompt(): void {
    this.setPromptText('');
  }

  removePrompt(): void {
    if (typeof this.getPos === 'function') {
      const pos = this.getPos()() ?? 0;
      this.editor().commands.deleteRange({ from: pos, to: pos + this.node().nodeSize });

    }
  }
}
