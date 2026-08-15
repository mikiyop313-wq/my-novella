import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';

import { AiStreamEditorService } from '../../helpers/ai/ai-stream-editor.service';
import {
  ManuscriptAiRequestService,
  buildManuscriptAiModificationText,
  extractGeneratedProse,
} from '../../helpers/ai/manuscript-ai-request.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { findCurrentSceneIdBeforePosition } from '../../../../shared/utils/story-context-builder';

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
  private readonly manuscriptAiRequest = inject(ManuscriptAiRequestService);
  private readonly toastService = inject(ToastService);


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

  isSceneGenerationBlocked = computed(() => {
    const blockPos = this.currentNodePosition();
    if (blockPos === null) return false;

    const sceneId = findCurrentSceneIdBeforePosition(this.editor().state.doc, blockPos);
    if (!sceneId) return false;

    return this.aiStreamEditor.hasActiveSceneGeneration(sceneId)
      && !this.aiStreamEditor.isSceneGenerationOwner({
        sceneId,
        ownerId: this.blockId(),
      });
  });

  modelId = computed(() => this.node().attrs['modelId'] || '');
  reasoningText = computed(() => this.node().attrs['reasoningText'] || '');

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
    if (!this.isModifying() && this.isSceneGenerationBlocked()) return;

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
    if (this.isLoading() || this.isSceneGenerationBlocked()) return;

    void this.regenerateResponse(null);
  }

  async submitModify(): Promise<void> {
    const requestedChange = this.modifyPrompt().trim();
    if (
      !requestedChange
      || this.isLoading()
      || this.isSceneGenerationBlocked()
    ) return;

    await this.regenerateResponse(requestedChange);
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

  private sourcePromptId(): string {
    return this.node().attrs['sourcePromptId'] || '';
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

  private async regenerateResponse(requestedChange: string | null): Promise<void> {
    const editor = this.editor();
    const blockId = this.blockId();
    const blockPos = this.currentNodePosition();
    if (blockPos === null) return;

    const sceneId = findCurrentSceneIdBeforePosition(editor.state.doc, blockPos);
    if (!sceneId || !this.aiStreamEditor.acquireSceneGeneration({
      sceneId,
      ownerId: blockId,
    })) return;

    const loadingSig = this.loadingSignal(blockId);
    loadingSig?.set('loading');

    try {
      const source = this.manuscriptAiRequest.findPromptSource(editor, this.sourcePromptId());
      if (!source) {
        this.toastService.error('The original AI prompt could not be found.', 'AI Generation');
        return;
      }

      const promptText = typeof source.node.attrs['promptText'] === 'string'
        ? source.node.attrs['promptText'].trim()
        : '';
      const modificationText = requestedChange
        ? buildManuscriptAiModificationText({
          promptText,
          generatedText: extractGeneratedProse(this.node()),
          requestedChange,
        })
        : null;
      const requestMessages = modificationText?.requestMessages ?? [{
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: promptText }],
      }];
      const contextPromptText = modificationText?.contextPromptText ?? promptText;
      const prepared = await this.manuscriptAiRequest.prepare({
        editor,
        promptPos: source.pos,
        promptAttrs: source.node.attrs,
        requestMessages,
        contextPromptText,
      });
      if (!prepared) return;

      const latestBlockPos = this.currentNodePosition();
      if (latestBlockPos === null) return;
      const latestSceneId = findCurrentSceneIdBeforePosition(editor.state.doc, latestBlockPos);
      if (latestSceneId !== sceneId) return;

      if (requestedChange) {
        this.isModifying.set(false);
        this.modifyPrompt.set('');
      }

      await this.aiStreamEditor.regenerateExistingBlock({
        editor,
        blockPos: latestBlockPos,
        currentAttrs: { ...this.node().attrs },
        aiPrompt: prepared.aiPrompt,
        provider: prepared.provider,
        modelId: prepared.modelId,
        reasoningMode: prepared.reasoningMode,
        bookId: prepared.bookId,
        promptText: prepared.promptText,
        sceneId,
      });
    } finally {
      loadingSig?.set('idle');
      this.aiStreamEditor.releaseSceneGeneration({ sceneId, ownerId: blockId });
    }
  }
}
