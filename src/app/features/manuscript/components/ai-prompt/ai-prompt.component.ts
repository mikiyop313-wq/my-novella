import { Component, ElementRef, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { CdkMenuModule } from '@angular/cdk/menu';
import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AIStateService } from '../../../../core/services/ai-state.service';

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
  isLoading = signal(false);

  constructor(private aiStateService: AIStateService) {
    super();
  }

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

  async onSubmit(): Promise<void> {
    // Prevent multiple submissions while already generating
    if (this.isLoading()) return;

    const text = this.promptText().trim();
    if (text && typeof this.getPos === 'function') {
      // Calculate the position immediately after this prompt component
      const pos: number = this.getPos()() ?? 0;
      const nodeSizePosition: number = this.node().nodeSize + pos;

      // Create an initial empty paragraph to receive the AI's response
      this.editor().chain().focus().insertContentAt(nodeSizePosition, {
        type: 'paragraph'
      }).run();

      // +1 to move the cursor inside the newly created paragraph node
      let currentInsertPos = nodeSizePosition + 1;
      this.isLoading.set(true);

      // Buffer to accumulate regular text characters to avoid slow 1-by-1 insertions
      let textBuffer = '';
      // Flag to track consecutive newlines so we only create one paragraph break for multiple \n\n
      let isNewlineSequence = false;

      // Helper function to insert the accumulated buffer into the editor
      const flushBuffer = () => {
        if (textBuffer.length > 0) {
          // Record doc size before insertion so we can accurately track how much it grew
          const beforeSize = this.editor().state.doc.content.size;
          this.editor().chain().insertContentAt(currentInsertPos, textBuffer).run();
          const afterSize = this.editor().state.doc.content.size;
          // Advance the insertion cursor by the exact number of nodes/characters added
          currentInsertPos += (afterSize - beforeSize);
          textBuffer = ''; // Reset buffer after successful insertion
        }
      };

      // Start streaming the AI response
      await this.aiStateService.generate(text, (token) => {
        if (token) {
          // Process the incoming chunk of text character by character
          for (let i = 0; i < token.length; i++) {
            const char = token[i];

            // Check for newlines (both Unix \n and Windows \r)
            if (char === '\n' || char === '\r') {
              // Ignore \r completely. Only act when we see \n
              if (char === '\n') {
                // If we aren't already in the middle of a sequence of newlines
                if (!isNewlineSequence) {
                  flushBuffer(); // Insert any pending text first
                  const beforeSize = this.editor().state.doc.content.size;

                  // Execute a Tiptap transaction to split the current paragraph node into two
                  this.editor().view.dispatch(this.editor().state.tr.split(currentInsertPos));

                  const afterSize = this.editor().state.doc.content.size;
                  currentInsertPos += (afterSize - beforeSize); // Move cursor into the new paragraph
                  isNewlineSequence = true;
                }
              }
            } else {
              // We hit a normal character. Reset the newline sequence flag and buffer the character.
              isNewlineSequence = false;
              textBuffer += char;
            }
          }
          // Flush the buffer at the end of each token so the user sees the text appearing live
          flushBuffer();
        }
      }).finally(() => {
        // Ensure any remaining text in the buffer is inserted when the stream finishes
        flushBuffer();
        this.isLoading.set(false);
      });
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
