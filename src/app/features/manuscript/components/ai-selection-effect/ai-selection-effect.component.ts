import { Component, computed, effect, inject, NgZone, signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { buildRephrasePrompt } from '../../../../shared/utils/story-context-builder';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { ManuscriptStore } from '../../store/manuscript.store';

type AiSelectionEffectState = 'idle' | 'drawing' | 'generating' | 'ready';

interface AiSelectionBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

const EFFECT_PADDING = 10;
const EFFECT_DRAW_DURATION_MS = 600;
const EFFECT_RESPONSE_DURATION_MS = 5_000;
const EFFECT_ACTIONS_HEIGHT = 48;
const AI_SELECTION_SPACING_PLUGIN_KEY = new PluginKey('aiSelectionSpacing');

@Component({
  selector: 'app-ai-selection-effect',
  standalone: true,
  templateUrl: './ai-selection-effect.component.html',
  styleUrl: './ai-selection-effect.component.scss',
})
export class AiSelectionEffectComponent {
  readonly state = signal<AiSelectionEffectState>('idle');
  readonly bounds = signal<AiSelectionBounds | null>(null);
  readonly frameHeight = computed(() => {
    const currentBounds = this.bounds();
    if (!currentBounds) return 0;
    return currentBounds.height + (this.state() === 'ready' ? EFFECT_ACTIONS_HEIGHT : 0);
  });

  private readonly store = inject(ManuscriptStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly aiStreamService = inject(AiStreamService);
  private readonly toastService = inject(ToastService);
  private readonly zone = inject(NgZone);
  private selection: { from: number; to: number } | null = null;
  private originalSelection: { from: number; to: number } | null = null;
  private previewSelection: { from: number; to: number } | null = null;
  private originalSlice: Slice | null = null;
  private candidateSlice: Slice | null = null;
  private editor: Editor | null = null;
  private mode: 'placeholder' | 'rephrase' | null = null;
  private streamId: string | null = null;
  private isInternalUpdate = false;
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      const currentEditor = this.store.editor();
      if (!currentEditor) return;

      currentEditor.on('selectionUpdate', this.onSelectionUpdate);
      currentEditor.on('update', this.onEditorUpdate);
      window.addEventListener('resize', this.onViewportChange);
      window.addEventListener('scroll', this.onViewportChange, true);

      onCleanup(() => {
        currentEditor.off('selectionUpdate', this.onSelectionUpdate);
        currentEditor.off('update', this.onEditorUpdate);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('scroll', this.onViewportChange, true);
        this.restoreOriginalPreview();
        this.dismiss();
      });
    });
  }

  /** Retains the existing placeholder effect used by unimplemented AI actions. */
  start(): boolean {
    if (!this.beginSelectionEffect('placeholder')) return false;

    this.drawTimer = setTimeout(() => {
      this.zone.run(() => {
        this.drawTimer = null;
        if (this.state() === 'drawing') this.state.set('generating');
      });
    }, EFFECT_DRAW_DURATION_MS);
    this.responseTimer = setTimeout(() => {
      this.zone.run(() => {
        this.responseTimer = null;
        if (this.state() !== 'idle') {
          this.state.set('ready');
          this.refreshSelectionSpacing(true);
          this.updatePosition();
        }
      });
    }, EFFECT_RESPONSE_DURATION_MS);

    return true;
  }

  /** Starts a real scene-aware rephrase request for the active selection. */
  startRephrase(): boolean {
    const currentEditor = this.store.editor();
    const bookId = this.workspaceStore.bookId();
    if (!currentEditor || this.state() !== 'idle') return false;
    if (!bookId) {
      this.toastService.error('No active book is available.', 'AI Rephrase');
      return false;
    }

    const { selection } = currentEditor.state;
    const context = buildRephrasePrompt(currentEditor.state.doc, {
      from: selection.from,
      to: selection.to,
    });
    if (!context) {
      this.toastService.error(
        'Select prose contained within a single scene to rephrase it.',
        'AI Rephrase',
      );
      return false;
    }

    if (!this.beginSelectionEffect('rephrase')) return false;

    this.originalSelection = { from: selection.from, to: selection.to };
    this.originalSlice = currentEditor.state.doc.slice(selection.from, selection.to);
    const requestId = crypto.randomUUID();
    this.streamId = requestId;
    this.drawTimer = setTimeout(() => {
      this.zone.run(() => {
        this.drawTimer = null;
        if (this.streamId !== requestId || this.state() !== 'drawing') return;
        this.state.set('generating');
        void this.generateRephrase(requestId, bookId, context.prompt);
      });
    }, EFFECT_DRAW_DURATION_MS);

    return true;
  }

  cancel(): void {
    this.restoreOriginalPreview();
    this.dismiss();
  }

  confirm(): void {
    if (this.mode === 'rephrase') this.commitRephrasePreview();
    this.dismiss();
  }

  private readonly onSelectionUpdate = () => {
    this.zone.run(() => {
      if (this.state() === 'idle' || this.isInternalUpdate) return;
      if (this.state() === 'ready' && this.mode === 'rephrase') {
        this.restoreOriginalPreview();
        this.dismiss();
        return;
      }
      if (!this.hasOriginalSelection()) {
        this.dismiss();
        return;
      }
      this.updatePosition();
    });
  };

  private readonly onEditorUpdate = (event?: { transaction: Transaction }) => {
    this.zone.run(() => {
      if (this.state() === 'idle' || this.isInternalUpdate) return;

      if (this.state() === 'ready' && this.previewSelection && event) {
        this.previewSelection = {
          from: event.transaction.mapping.map(this.previewSelection.from, -1),
          to: event.transaction.mapping.map(this.previewSelection.to, 1),
        };
        this.selection = this.previewSelection;
        this.restoreOriginalPreview();
      }
      this.dismiss();
    });
  };

  private readonly onViewportChange = () => {
    this.zone.run(() => {
      if (this.state() !== 'idle') this.updatePosition();
    });
  };

  private beginSelectionEffect(mode: 'placeholder' | 'rephrase'): boolean {
    if (this.state() !== 'idle') return false;

    const currentEditor = this.store.editor();
    if (!currentEditor) return false;

    const { selection } = currentEditor.state;
    if (selection.empty || selection.from === selection.to) return false;

    const selectedText = currentEditor.state.doc
      .textBetween(selection.from, selection.to, ' ')
      .trim();
    if (!selectedText) return false;

    this.mode = mode;
    this.selection = { from: selection.from, to: selection.to };
    this.editor = currentEditor;
    this.addSelectionSpacing(currentEditor, this.selection, false, true);
    if (!this.updatePosition(currentEditor)) {
      this.removeSelectionSpacing();
      this.resetSelectionState();
      return false;
    }

    window.getSelection()?.removeAllRanges();
    this.state.set('drawing');
    return true;
  }

  private async generateRephrase(
    requestId: string,
    bookId: string,
    prompt: string,
  ): Promise<void> {
    let response = '';

    try {
      await this.aiStreamService.streamText({
        streamId: requestId,
        bookId,
        systemPromptCategory: 'rephrase',
        prompt,
        onToken: token => response += token,
      });

      if (this.streamId !== requestId || this.state() !== 'generating') return;

      const replacement = response.trim();
      if (!replacement) {
        this.toastService.error('The model returned an empty rephrase.', 'AI Rephrase');
        this.streamId = null;
        this.dismiss();
        return;
      }

      const candidateSlice = this.parseCandidateSlice(replacement);
      if (!candidateSlice) {
        this.toastService.error('The rephrased text could not be rendered.', 'AI Rephrase');
        this.streamId = null;
        this.dismiss();
        return;
      }

      this.candidateSlice = candidateSlice;
      this.streamId = null;
      this.previewCandidate(candidateSlice);
    } catch (error) {
      if (this.streamId !== requestId) return;
      console.error('AI rephrasing failed:', error);
      this.streamId = null;
      this.dismiss();
    }
  }

  private parseCandidateSlice(markdown: string): Slice | null {
    const editor = this.editor;
    if (!editor?.markdown) return null;

    try {
      const parsedDocument = editor.markdown.parse(markdown);
      const parsedNode = editor.schema.nodeFromJSON(parsedDocument);
      if (parsedNode.content.size === 0) return null;
      return Slice.maxOpen(parsedNode.content);
    } catch (error) {
      console.warn('Failed to parse rephrased Markdown:', error);
      return null;
    }
  }

  private previewCandidate(candidateSlice: Slice): void {
    const editor = this.editor;
    const original = this.originalSelection;
    if (!editor || !original) return;

    this.removeSelectionSpacing();
    const tr = editor.state.tr.replaceRange(original.from, original.to, candidateSlice);
    const previewSelection = {
      from: tr.mapping.map(original.from, -1),
      to: tr.mapping.map(original.to, 1),
    };
    tr.setMeta('addToHistory', false);
    tr.setMeta('skipSaver', true);
    this.dispatchInternal(editor, tr);

    this.previewSelection = previewSelection;
    this.selection = previewSelection;
    this.addSelectionSpacing(editor, previewSelection, true);
    this.state.set('ready');
    this.updatePosition();
  }

  private restoreOriginalPreview(): void {
    const editor = this.editor;
    const preview = this.previewSelection;
    const originalSlice = this.originalSlice;
    if (!editor || !preview || !originalSlice) return;

    this.removeSelectionSpacing();
    const tr = editor.state.tr.replaceRange(preview.from, preview.to, originalSlice);
    tr.setMeta('addToHistory', false);
    tr.setMeta('skipSaver', true);
    this.dispatchInternal(editor, tr);
    this.previewSelection = null;
    this.selection = this.originalSelection;
  }

  private commitRephrasePreview(): void {
    const editor = this.editor;
    const original = this.originalSelection;
    const candidateSlice = this.candidateSlice;
    if (!editor || !original || !candidateSlice || !this.previewSelection) return;

    this.restoreOriginalPreview();
    const tr = editor.state.tr.replaceRange(original.from, original.to, candidateSlice);
    this.dispatchInternal(editor, tr);
    editor.commands.focus();
  }

  private dispatchInternal(editor: Editor, transaction: Transaction): void {
    this.isInternalUpdate = true;
    try {
      editor.view.dispatch(transaction);
    } finally {
      this.isInternalUpdate = false;
    }
  }

  private dismiss(): void {
    const activeStreamId = this.streamId;
    this.clearTimers();
    this.removeSelectionSpacing();
    this.resetSelectionState();
    this.bounds.set(null);
    this.state.set('idle');
    if (activeStreamId) void this.aiStreamService.stopStream(activeStreamId);
  }

  private resetSelectionState(): void {
    this.selection = null;
    this.originalSelection = null;
    this.previewSelection = null;
    this.originalSlice = null;
    this.candidateSlice = null;
    this.editor = null;
    this.mode = null;
    this.streamId = null;
  }

  private updatePosition(editor = this.editor): boolean {
    if (!editor || !this.selection) return false;
    const rect = this.getRangeRect(editor, this.selection);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    this.bounds.set({
      top: rect.top - EFFECT_PADDING,
      left: rect.left - EFFECT_PADDING,
      width: rect.width + EFFECT_PADDING * 2,
      height: rect.height + EFFECT_PADDING * 2,
    });
    return true;
  }

  private getRangeRect(editor: Editor, selection: { from: number; to: number }): DOMRect | null {
    try {
      const start = editor.view.domAtPos(selection.from);
      const end = editor.view.domAtPos(selection.to);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range.getBoundingClientRect();
    } catch {
      return null;
    }
  }

  private hasOriginalSelection(): boolean {
    const editor = this.editor;
    const original = this.selection;
    if (!editor || this.store.editor() !== editor || !original) return false;
    const { selection } = editor.state;
    return selection.from === original.from && selection.to === original.to;
  }

  private clearTimers(): void {
    if (this.drawTimer !== null) clearTimeout(this.drawTimer);
    if (this.responseTimer !== null) clearTimeout(this.responseTimer);
    this.drawTimer = null;
    this.responseTimer = null;
  }

  private addSelectionSpacing(
    editor: Editor,
    selection: { from: number; to: number },
    includeActionSpace = false,
    isGenerating = false,
  ): void {
    editor.registerPlugin(new Plugin({
      key: AI_SELECTION_SPACING_PLUGIN_KEY,
      props: {
        decorations: state => {
          const decorations: Decoration[] = [Decoration.inline(selection.from, selection.to, {
            class: `ai-selection-spacing${isGenerating ? ' ai-selection-generating' : ''}`,
          })];
          if (includeActionSpace) {
            decorations.push(Decoration.widget(selection.to, () => {
              const spacer = document.createElement('span');
              spacer.className = 'ai-selection-action-spacer';
              spacer.contentEditable = 'false';
              return spacer;
            }, { side: 1 }));
          }
          return DecorationSet.create(state.doc, decorations);
        },
      },
    }));
  }

  private refreshSelectionSpacing(includeActionSpace: boolean): void {
    const editor = this.editor;
    const selection = this.selection;
    if (!editor || !selection) return;
    editor.unregisterPlugin(AI_SELECTION_SPACING_PLUGIN_KEY);
    this.addSelectionSpacing(editor, selection, includeActionSpace);
  }

  private removeSelectionSpacing(): void {
    this.editor?.unregisterPlugin(AI_SELECTION_SPACING_PLUGIN_KEY);
  }
}
