import { Component, signal, inject, computed, ElementRef, ViewChild, HostListener, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { AiStreamEditorService } from '../../helpers/ai-stream-editor.service';

@Component({
  selector: 'app-ai-generated-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-generated-block.component.html',
  styleUrl: './ai-generated-block.component.scss'
})
export class AiGeneratedBlockComponent extends AngularNodeViewComponent {
  private aiStreamEditor = inject(AiStreamEditorService);

  @ViewChild('contentDOM') contentDOM!: ElementRef;

  isModifying = signal(false);
  modifyPrompt = signal('');
  hasCopied = signal(false);
  isLoading = computed(() => {
    const blockId = this.node().attrs['id'];
    const loadingSig = this.aiStreamEditor.loadingState.get(blockId);
    return loadingSig ? loadingSig() !== 'idle' : false;
  });

  promptText = computed(() => this.node().attrs['promptText'] || '');
  provider = computed(() => this.node().attrs['provider'] || '');
  modelId = computed(() => this.node().attrs['modelId'] || '');
  reasoningText = computed(() => this.node().attrs['reasoningText'] || '');
  reasoningMode = computed(() => this.node().attrs['reasoningMode'] || false);
  /** True only while the AI is actively streaming — false once the block is finalized. */
  isGenerating = computed(() => this.node().attrs['isGenerating'] === true);

  /** Live word count — recomputes on every token inserted by the stream. */
  wordCount = computed(() => {
    const text = this.node().textContent?.trim() ?? '';
    if (!text) return 0;
    return text.split(/\s+/).filter(w => w.length > 0).length;
  });

  isReasoningExpanded = signal(true);

  ngOnInit(): void {
    let blockId = this.node().attrs['id'];
    if (!blockId) {
      blockId = crypto.randomUUID();
      setTimeout(() => {
        if (typeof this.getPos === 'function') {
          const pos = this.getPos()();
          if (pos != null) {
            const tr = this.editor().state.tr.setNodeMarkup(pos, undefined, {
              ...this.node().attrs,
              id: blockId
            });
            tr.setMeta('addToHistory', false);
            this.editor().view.dispatch(tr);
          }
        }
      });
    }

    if (!this.aiStreamEditor.loadingState.has(blockId)) {
      this.aiStreamEditor.loadingState.set(blockId, signal('idle'));
    }
  }

  toggleReasoning() {
    this.isReasoningExpanded.set(!this.isReasoningExpanded());
  }

  applyText() {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    this.aiStreamEditor.applyBlock(
      this.editor(),
      pos,
      this.node().nodeSize,
      this.node().content
    );
  }

  discardText() {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    this.aiStreamEditor.discardBlock(this.editor(), pos, this.node().nodeSize);
  }

  copyText() {
    const contentEl = this.contentDOM?.nativeElement;
    if (!contentEl?.innerText) return;

    const item = new ClipboardItem({
      'text/plain': new Blob([contentEl.innerText], { type: 'text/plain' }),
      'text/html': new Blob([contentEl.innerHTML], { type: 'text/html' })
    });

    navigator.clipboard.write([item]).then(() => {
      this.hasCopied.set(true);
      setTimeout(() => this.hasCopied.set(false), 2000);
    });
  }

  tryAgain() {
    if (this.isLoading()) return;

    const blockId = this.node().attrs['id'];
    const loadingSig = this.aiStreamEditor.loadingState.get(blockId);
    loadingSig?.set('loading');

    this.generateNewText(this.promptText()).finally(() => {
      loadingSig?.set('idle');
    });
  }

  toggleModify() {
    this.isModifying.set(!this.isModifying());
    if (!this.isModifying()) {
      this.modifyPrompt.set('');
    }
  }

  async submitModify() {

    const blockId = this.node().attrs['id'];
    const loadingSig = this.aiStreamEditor.loadingState.get(blockId);


    if (!this.modifyPrompt().trim() || this.isLoading()) return;

    const originalText = this.node().textContent;
    const combinedPrompt = `Original request: ${this.promptText()}\n\nGenerated text:\n${originalText}\n\nUser request to change:\n${this.modifyPrompt()}`;

    this.isModifying.set(false);
    this.modifyPrompt.set('');
    loadingSig?.set('loading');
    await this.generateNewText(combinedPrompt).finally(() => {
      loadingSig?.set('idle');
    });
  }

  private async generateNewText(prompt: string) {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    await this.aiStreamEditor.regenerateExistingBlock(
      this.editor(),
      pos,
      { ...this.node().attrs },
      prompt,
      this.provider(),
      this.modelId(),
      this.reasoningMode()
    );
  }
}
