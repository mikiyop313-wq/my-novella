import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';

import { AiStreamEditorService } from '../../helpers/ai/ai-stream-editor.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';

// ---------------------------------------------------------------------------
//  Local Types
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-ai-generated-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-generated-block.component.html',
  styleUrl: './ai-generated-block.component.scss'
})
export class AiGeneratedBlockComponent extends AngularNodeViewComponent {

  // ---------------------------------------------------------------------------
  //  Dependency Injection
  // ---------------------------------------------------------------------------

  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly toastService = inject(ToastService);
  private readonly workspaceStore = inject(WorkspaceStore);


  // ---------------------------------------------------------------------------
  //  View Children
  // ---------------------------------------------------------------------------

  @ViewChild('contentDOM') contentDOM!: ElementRef<HTMLElement>;


  // ---------------------------------------------------------------------------
  //  Component State
  // ---------------------------------------------------------------------------

  isModifying = signal(false);
  modifyPrompt = signal('');
  hasCopied = signal(false);
  isReasoningExpanded = signal(true);


  // ---------------------------------------------------------------------------
  //  Computed Properties
  // ---------------------------------------------------------------------------

  isLoading = computed(() => {
    const loadingSig = this.loadingSignal(this.blockId());

    return loadingSig ? loadingSig() !== 'idle' : false;
  });

  promptText = computed(() => this.node().attrs['promptText'] || '');
  provider = computed(() => this.node().attrs['provider'] || '');
  modelId = computed(() => this.node().attrs['modelId'] || '');
  reasoningText = computed(() => this.node().attrs['reasoningText'] || '');
  reasoningMode = computed(() => this.node().attrs['reasoningMode'] || false);

  /** True only while the AI is actively streaming; false once the block is finalized. */
  isGenerating = computed(() => this.node().attrs['isGenerating'] === true);

  /** Live word count. Recomputes on every token inserted by the stream. */
  wordCount = computed(() => {
    const text = this.node().textContent?.trim() ?? '';

    if (!text) return 0;

    return text.split(/\s+/).filter(word => word.length > 0).length;
  });


  // ---------------------------------------------------------------------------
  //  Lifecycle Hooks
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.ensureBlockId();
  }


  // ---------------------------------------------------------------------------
  //  View Event Handlers
  // ---------------------------------------------------------------------------

  toggleReasoning(): void {
    this.isReasoningExpanded.update(isExpanded => !isExpanded);
  }

  toggleModify(): void {
    this.isModifying.update(isModifying => !isModifying);

    if (!this.isModifying()) {
      this.modifyPrompt.set('');
    }
  }


  // ---------------------------------------------------------------------------
  //  Actions
  // ---------------------------------------------------------------------------

  applyText(): void {
    const pos = this.currentNodePosition();

    if (pos === null) return;

    this.aiStreamEditor.applyBlock(
      this.editor(),
      pos,
      this.node().nodeSize,
      this.node().content
    );
  }

  discardText(): void {
    const pos = this.currentNodePosition();

    if (pos === null) return;

    this.aiStreamEditor.discardBlock(this.editor(), pos, this.node().nodeSize);
  }

  copyText(): void {
    const contentEl = this.contentDOM?.nativeElement;
    const plainText = contentEl?.innerText;

    if (!contentEl || !plainText) return;

    const item = new ClipboardItem({
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
      'text/html': new Blob([contentEl.innerHTML], { type: 'text/html' })
    });

    navigator.clipboard.write([item]).then(() => {
      this.hasCopied.set(true);
      setTimeout(() => this.hasCopied.set(false), 2000);
    });
  }

  tryAgain(): void {
    if (this.isLoading()) return;

    const loadingSig = this.loadingSignal(this.blockId());
    loadingSig?.set('loading');

    this.generateNewText(this.promptText()).finally(() => {
      loadingSig?.set('idle');
    });
  }

  async submitModify(): Promise<void> {
    const requestedChange = this.modifyPrompt().trim();
    const loadingSig = this.loadingSignal(this.blockId());

    if (!requestedChange || this.isLoading()) return;

    const combinedPrompt = this.buildModifyPrompt(requestedChange);

    this.isModifying.set(false);
    this.modifyPrompt.set('');
    loadingSig?.set('loading');

    await this.generateNewText(combinedPrompt).finally(() => {
      loadingSig?.set('idle');
    });
  }


  // ---------------------------------------------------------------------------
  //  Private Helpers
  // ---------------------------------------------------------------------------

  /** Ensure this NodeView has a stable ID for stream state and regeneration. */
  private ensureBlockId(): void {
    let blockId = this.blockId();

    if (!blockId) {
      blockId = crypto.randomUUID();

      // Defer the attribute write until Angular has finished creating the NodeView.
      setTimeout(() => {
        const pos = this.currentNodePosition();

        if (pos !== null) {
          const tr = this.editor().state.tr.setNodeMarkup(pos, undefined, {
            ...this.node().attrs,
            id: blockId
          });

          tr.setMeta('addToHistory', false);
          this.editor().view.dispatch(tr);
        }
      });
    }

    if (!this.aiStreamEditor.loadingState.has(blockId)) {
      this.aiStreamEditor.loadingState.set(blockId, signal('idle'));
    }
  }

  /** Returns the ID that connects this block with the stream editor service. */
  private blockId(): string {
    return this.node().attrs['id'] || '';
  }

  /** Safely read the current node position from the Tiptap NodeView API. */
  private currentNodePosition(): number | null {
    if (typeof this.getPos !== 'function') return null;

    return this.getPos()() ?? null;
  }

  /** Get the per-block loading signal managed by the AI stream service. */
  private loadingSignal(blockId: string): WritableSignal<LoadingStatus> | undefined {
    return this.aiStreamEditor.loadingState.get(blockId);
  }

  /** Build a regeneration prompt that preserves the original request and output. */
  private buildModifyPrompt(requestedChange: string): string {
    return [
      `Original request: ${this.promptText()}`,
      `Generated text:\n${this.node().textContent}`,
      `User request to change:\n${requestedChange}`
    ].join('\n\n');
  }

  private async generateNewText(prompt: string): Promise<void> {
    const pos = this.currentNodePosition();
    const bookId = this.workspaceStore.bookId();

    if (pos === null) return;
    if (!bookId) {
      this.toastService.error('No active book is available.', 'AI Generation');
      return;
    }

    await this.aiStreamEditor.regenerateExistingBlock(
      this.editor(),
      pos,
      { ...this.node().attrs },
      prompt,
      this.provider(),
      this.modelId(),
      this.reasoningMode(),
      bookId,
    );
  }
}
