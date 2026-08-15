import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { CdkMenuModule } from '@angular/cdk/menu';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';

@Component({
  selector: 'app-ai-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, OverlayModalDirective],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {
  @ViewChild('promptInput') promptInput!: ElementRef<HTMLDivElement>;

  // Interactive UI states
  promptText = signal('');
  isFocused = signal(false);
  selectedModel = signal<string | null>(null);

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    this.isFocused.set(false);
  }

  onInput(event: Event): void {
    const target = event.target as HTMLDivElement;
    this.promptText.set(target.innerText || '');
  }

  setPromptText(text: string): void {
    this.promptText.set(text);
    if (this.promptInput) {
      this.promptInput.nativeElement.innerText = text;
    }
  }

  onSubmit(): void {
    const text = this.promptText().trim();
    if (text && typeof this.getPos === 'function') {
      const pos: number = this.getPos()() ?? 0;

      // We want to insert the generated text below this node
      // For demonstration, we'll insert a paragraph with some "generated" text.
      // In a real app, this would call an API.
      const generatedText = `[AI Generated response for: "${text}"]`;

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
