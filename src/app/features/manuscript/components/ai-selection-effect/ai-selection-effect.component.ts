import { Component, computed, effect, inject, NgZone, signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { AiStreamService } from '../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  buildAiPrompt,
  type BuiltAiPrompt,
} from '../../../../shared/utils/ai-prompt-builder';
import {
  buildSelectionEditContext,
  serializeCodexContext,
  serializePartialOutline,
  type SelectionEditContext,
  type SelectionEditAdditionalContext,
} from '../../../../shared/utils/story-context-builder';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { CodexService } from '../../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { ManuscriptStore } from '../../store/manuscript.store';
import {
  buildAiSelectionDiff,
  type AiSelectionDiffSegment,
} from './ai-selection-diff';

type AiSelectionEffectState = 'idle' | 'drawing' | 'generating' | 'ready';

interface AiSelectionBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

const EFFECT_PADDING = 10;
const EFFECT_DRAW_DURATION_MS = 600;
const EFFECT_ACTIONS_HEIGHT = 48;
const EFFECT_READY_MIN_WIDTH = 280;
const AI_SELECTION_SPACING_PLUGIN_KEY = new PluginKey('aiSelectionSpacing');

export type AiSelectionEditCategory = 'rephrase' | 'expand' | 'shorten';

export interface AiSelectionEditRequest {
  category: AiSelectionEditCategory;
  instruction: string;
  actionLabel: 'Rephrase' | 'Expand' | 'Shorten' | 'Other';
}

@Component({
  selector: 'app-ai-selection-effect',
  standalone: true,
  templateUrl: './ai-selection-effect.component.html',
  styleUrl: './ai-selection-effect.component.scss',
})
export class AiSelectionEffectComponent {
  readonly state = signal<AiSelectionEffectState>('idle');
  readonly bounds = signal<AiSelectionBounds | null>(null);
  readonly clipPath = signal<string | null>(null);
  readonly comparisonSegments = signal<AiSelectionDiffSegment[]>([]);
  readonly isComparisonVisible = signal(false);
  readonly canCompare = computed(() => (
    this.state() === 'ready' && this.comparisonSegments().length > 0
  ));
  readonly frameHeight = computed(() => {
    const currentBounds = this.bounds();
    if (!currentBounds) return 0;
    if (this.state() !== 'ready') return currentBounds.height;
    return currentBounds.height + EFFECT_ACTIONS_HEIGHT;
  });

  private readonly store = inject(ManuscriptStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly aiStreamService = inject(AiStreamService);
  private readonly toastService = inject(ToastService);
  private readonly codexContext = inject(CodexContextTrieService);
  private readonly codexService = inject(CodexService);
  private readonly manuscriptStructureService = inject(ManuscriptStructureService);
  private readonly zone = inject(NgZone);
  private selection: { from: number; to: number } | null = null;
  private previewSelection: { from: number; to: number } | null = null;
  private originalSlice: Slice | null = null;
  private candidateSlice: Slice | null = null;
  private editor: Editor | null = null;
  private activeRequest: AiSelectionEditRequest | null = null;
  private streamId: string | null = null;
  private isInternalUpdate = false;
  private drawTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Starts a scene-aware AI edit request for the active selection. */
  startEdit(request: AiSelectionEditRequest): boolean {
    const currentEditor = this.store.editor();
    const bookId = this.workspaceStore.bookId();
    if (!currentEditor || this.state() !== 'idle') return false;
    const instruction = request.instruction.trim();
    if (!instruction) return false;
    if (!bookId) {
      this.toastService.error('No active book is available.', `AI ${request.actionLabel}`);
      return false;
    }

    const { selection } = currentEditor.state;
    const documentSnapshot = currentEditor.state.doc;
    const selectionSnapshot = { from: selection.from, to: selection.to };
    const context = buildSelectionEditContext(
      documentSnapshot,
      selectionSnapshot,
    );
    if (!context) {
      this.toastService.error(
        `Select prose contained within a single scene to use ${request.actionLabel}.`,
        `AI ${request.actionLabel}`,
      );
      return false;
    }

    if (!this.beginSelectionEffect()) return false;

    this.activeRequest = { ...request, instruction };
    this.originalSlice = currentEditor.state.doc.slice(selection.from, selection.to);
    const requestId = crypto.randomUUID();
    this.streamId = requestId;
    this.drawTimer = setTimeout(() => {
      this.zone.run(() => {
        this.drawTimer = null;
        if (this.streamId !== requestId || this.state() !== 'drawing') return;
        this.state.set('generating');
        void this.generateEdit(
          requestId,
          bookId,
          documentSnapshot,
          selectionSnapshot,
          context,
          this.activeRequest!,
        );
      });
    }, EFFECT_DRAW_DURATION_MS);

    return true;
  }

  cancel(): void {
    this.restoreOriginalPreview();
    this.dismiss();
  }

  confirm(): void {
    this.commitEditPreview();
    this.dismiss();
  }

  toggleComparison(): void {
    if (!this.canCompare()) return;
    if (this.isComparisonVisible()) {
      this.hideInlineComparison();
    } else {
      this.showInlineComparison();
    }
  }

  private readonly onSelectionUpdate = () => {
    this.zone.run(() => {
      if (this.state() === 'idle' || this.isInternalUpdate) return;
      this.updatePosition();
    });
  };

  private readonly onEditorUpdate = (event?: { transaction: Transaction }) => {
    this.zone.run(() => {
      if (this.state() === 'idle' || this.isInternalUpdate) return;

      if (this.selection && event?.transaction.docChanged) {
        this.selection = mapSelection(this.selection, event.transaction);
        if (this.previewSelection) this.previewSelection = this.selection;
        this.refreshSelectionSpacing();
      }
      this.updatePosition();
    });
  };

  private readonly onViewportChange = () => {
    this.zone.run(() => {
      if (this.state() !== 'idle') this.updatePosition();
    });
  };

  private beginSelectionEffect(): boolean {
    if (this.state() !== 'idle') return false;

    const currentEditor = this.store.editor();
    if (!currentEditor) return false;

    const { selection } = currentEditor.state;
    if (selection.empty || selection.from === selection.to) return false;

    const selectedText = currentEditor.state.doc
      .textBetween(selection.from, selection.to, ' ')
      .trim();
    if (!selectedText) return false;

    this.selection = { from: selection.from, to: selection.to };
    this.editor = currentEditor;
    this.addSelectionSpacing(currentEditor, this.selection, { isGenerating: true });
    if (!this.updatePosition(currentEditor)) {
      this.removeSelectionSpacing();
      this.resetSelectionState();
      return false;
    }

    window.getSelection()?.removeAllRanges();
    this.state.set('drawing');
    return true;
  }

  private async generateEdit(
    requestId: string,
    bookId: string,
    documentSnapshot: ProseMirrorNode,
    selectionSnapshot: { from: number; to: number },
    context: SelectionEditContext,
    request: AiSelectionEditRequest,
  ): Promise<void> {
    let response = '';

    try {
      let currentContext = context;
      if (request.category === 'expand' || request.category === 'shorten') {
        const additionalContext = await this.prepareExtendedContext(
          bookId,
          context.sceneId,
          context.sceneContent,
          context.selectedProse,
        );
        if (this.streamId !== requestId || this.state() !== 'generating') return;

        const enrichedContext = buildSelectionEditContext(
          documentSnapshot,
          selectionSnapshot,
          additionalContext,
        );
        if (!enrichedContext) throw new Error('Could not rebuild the selection edit prompt.');
        currentContext = enrichedContext;
      }

      await this.aiStreamService.streamText({
        streamId: requestId,
        bookId,
        aiPrompt: buildSelectionEditAiPrompt({ context: currentContext, request }),
        onToken: token => response += token,
      });

      if (this.streamId !== requestId || this.state() !== 'generating') return;

      const replacement = response.trim();
      if (!replacement) {
        this.toastService.error(
          `The model returned an empty ${request.actionLabel.toLowerCase()} result.`,
          `AI ${request.actionLabel}`,
        );
        this.streamId = null;
        this.dismiss();
        return;
      }

      const candidateSlice = this.parseCandidateSlice(replacement);
      if (!candidateSlice) {
        this.toastService.error(
          `The ${request.actionLabel.toLowerCase()} result could not be rendered.`,
          `AI ${request.actionLabel}`,
        );
        this.streamId = null;
        this.dismiss();
        return;
      }

      this.candidateSlice = candidateSlice;
      if (request.category === 'rephrase' && this.originalSlice) {
        this.comparisonSegments.set(buildAiSelectionDiff(
          sliceText(this.originalSlice),
          sliceText(candidateSlice),
        ));
      }
      this.streamId = null;
      this.previewCandidate(candidateSlice);
    } catch (error) {
      if (this.streamId !== requestId) return;
      console.error(`AI ${request.actionLabel.toLowerCase()} failed:`, error);
      this.toastService.error(
        `Could not complete ${request.actionLabel.toLowerCase()}.`,
        `AI ${request.actionLabel}`,
      );
      this.streamId = null;
      this.dismiss();
    }
  }

  private async prepareExtendedContext(
    bookId: string,
    sceneId: string,
    sceneContent: string,
    selectedProse: string,
  ): Promise<SelectionEditAdditionalContext> {
    if (!this.codexContext.trie() || this.codexContext.isLoading() || this.codexContext.error()) {
      throw new Error('Codex context is not available.');
    }

    const detectedEntryIds = new Set(
      this.codexContext.findMatches(selectedProse)
        .filter(match =>
          match.value.status === 'active'
          && (
            match.value.trackingSetting === 'include_when_detected'
            || match.value.trackingSetting === 'always_include'
          ),
        )
        .map(match => match.value.entryId),
    );
    const [outline, codexEntries] = await Promise.all([
      this.manuscriptStructureService.getOutline(bookId),
      Promise.all([...detectedEntryIds].map(entryId => this.codexService.getEntry(entryId))),
    ]);
    if (codexEntries.some(entry => entry === undefined)) {
      throw new Error('A detected Codex entry could not be loaded.');
    }

    return {
      partialOutline: serializePartialOutline(
        outline,
        this.workspaceStore.bookTitle(),
        sceneId,
        { currentSceneProse: sceneContent },
      ),
      codexContext: serializeCodexContext(
        codexEntries.filter(entry => entry !== undefined),
        outline,
        sceneId,
      ),
      sceneIncludedInOutline: true,
    };
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
    const original = this.selection;
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
    this.addSelectionSpacing(editor, previewSelection, {
      reservedHeight: EFFECT_ACTIONS_HEIGHT,
    });
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
    const restoredSelection = mapReplacedSelection(preview, tr);
    tr.setMeta('addToHistory', false);
    tr.setMeta('skipSaver', true);
    this.dispatchInternal(editor, tr);
    this.previewSelection = null;
    this.selection = restoredSelection;
  }

  private commitEditPreview(): void {
    const editor = this.editor;
    const candidateSlice = this.candidateSlice;
    if (!editor || !candidateSlice || !this.previewSelection) return;

    this.restoreOriginalPreview();
    const restoredSelection = this.selection;
    if (!restoredSelection) return;
    const tr = editor.state.tr.replaceRange(
      restoredSelection.from,
      restoredSelection.to,
      candidateSlice,
    );
    this.dispatchInternal(editor, tr);
    editor.commands.focus();
  }

  private showInlineComparison(): void {
    const editor = this.editor;
    const preview = this.previewSelection;
    if (!editor || !preview) return;

    const displaySegments = createInlineComparisonSegments(this.comparisonSegments());
    const comparisonSlice = createComparisonSlice(editor, displaySegments);
    if (!comparisonSlice) return;

    this.replaceActivePreview({
      replacement: comparisonSlice,
      isComparisonVisible: true,
      comparisonSegments: displaySegments,
    });
  }

  private hideInlineComparison(): void {
    if (!this.candidateSlice) return;
    this.replaceActivePreview({
      replacement: this.candidateSlice,
      isComparisonVisible: false,
    });
  }

  private replaceActivePreview(options: {
    replacement: Slice;
    isComparisonVisible: boolean;
    comparisonSegments?: AiSelectionDiffSegment[];
  }): void {
    const editor = this.editor;
    const preview = this.previewSelection;
    if (!editor || !preview) return;

    this.removeSelectionSpacing();
    const transaction = editor.state.tr.replaceRange(
      preview.from,
      preview.to,
      options.replacement,
    );
    const replacementSelection = mapReplacedSelection(preview, transaction);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('skipSaver', true);
    this.dispatchInternal(editor, transaction);

    this.previewSelection = replacementSelection;
    this.selection = replacementSelection;
    this.isComparisonVisible.set(options.isComparisonVisible);
    this.addSelectionSpacing(editor, replacementSelection, {
      reservedHeight: EFFECT_ACTIONS_HEIGHT,
      comparisonSegments: options.comparisonSegments,
    });
    this.updatePosition();
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
    this.clipPath.set(null);
    this.state.set('idle');
    if (activeStreamId) void this.aiStreamService.stopStream(activeStreamId);
  }

  private resetSelectionState(): void {
    this.selection = null;
    this.previewSelection = null;
    this.originalSlice = null;
    this.candidateSlice = null;
    this.editor = null;
    this.activeRequest = null;
    this.streamId = null;
    this.comparisonSegments.set([]);
    this.isComparisonVisible.set(false);
  }

  private updatePosition(editor = this.editor): boolean {
    if (!editor || !this.selection) return false;
    const rect = this.getRangeRect(editor, this.selection);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    const effectBounds = {
      top: rect.top - EFFECT_PADDING,
      left: rect.left - EFFECT_PADDING,
      width: rect.width + EFFECT_PADDING * 2,
      height: rect.height + EFFECT_PADDING * 2,
    };
    const editorViewport = editor.view.dom.closest('.editor-content-wrapper');
    if (!editorViewport) return false;

    this.bounds.set(effectBounds);
    this.clipPath.set(this.getClipPath(effectBounds, editorViewport.getBoundingClientRect()));
    return true;
  }

  private getClipPath(effectBounds: AiSelectionBounds, viewportRect: DOMRect): string {
    const effectWidth = this.state() === 'ready'
      ? Math.max(effectBounds.width, EFFECT_READY_MIN_WIDTH)
      : effectBounds.width;
    const effectHeight = this.state() === 'ready'
      ? effectBounds.height + EFFECT_ACTIONS_HEIGHT
      : effectBounds.height;
    const top = Math.max(0, viewportRect.top - effectBounds.top);
    const right = Math.max(0, effectBounds.left + effectWidth - viewportRect.right);
    const bottom = Math.max(0, effectBounds.top + effectHeight - viewportRect.bottom);
    const left = Math.max(0, viewportRect.left - effectBounds.left);

    return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
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

  private clearTimers(): void {
    if (this.drawTimer !== null) clearTimeout(this.drawTimer);
    this.drawTimer = null;
  }

  private addSelectionSpacing(
    editor: Editor,
    selection: { from: number; to: number },
    options: {
      reservedHeight?: number;
      isGenerating?: boolean;
      comparisonSegments?: AiSelectionDiffSegment[];
    } = {},
  ): void {
    editor.registerPlugin(new Plugin({
      key: AI_SELECTION_SPACING_PLUGIN_KEY,
      filterTransaction: transaction => (
        this.isInternalUpdate || !transactionTouchesSelection(transaction, selection)
      ),
      props: {
        decorations: state => {
          const decorations: Decoration[] = [Decoration.inline(selection.from, selection.to, {
            class: `ai-selection-spacing${options.isGenerating ? ' ai-selection-generating' : ''}`,
          })];
          if (options.comparisonSegments) {
            decorations.push(...createComparisonDecorations(
              state.doc,
              selection,
              options.comparisonSegments,
            ));
          }
          if (options.reservedHeight) {
            decorations.push(Decoration.widget(selection.to, () => {
              const spacer = document.createElement('span');
              spacer.className = 'ai-selection-action-spacer';
              spacer.contentEditable = 'false';
              spacer.style.height = `${options.reservedHeight}px`;
              return spacer;
            }, { side: 1 }));
          }
          return DecorationSet.create(state.doc, decorations);
        },
      },
    }));
  }

  private refreshSelectionSpacing(): void {
    const editor = this.editor;
    const selection = this.selection;
    if (!editor || !selection) return;
    editor.unregisterPlugin(AI_SELECTION_SPACING_PLUGIN_KEY);
    this.addSelectionSpacing(
      editor,
      selection,
      {
        reservedHeight: this.state() === 'ready'
          ? EFFECT_ACTIONS_HEIGHT
          : undefined,
        isGenerating: this.state() === 'drawing' || this.state() === 'generating',
        comparisonSegments: this.isComparisonVisible()
          ? createInlineComparisonSegments(this.comparisonSegments())
          : undefined,
      },
    );
  }

  private removeSelectionSpacing(): void {
    this.editor?.unregisterPlugin(AI_SELECTION_SPACING_PLUGIN_KEY);
  }
}

function sliceText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, '\n');
}

function createInlineComparisonSegments(
  segments: AiSelectionDiffSegment[],
): AiSelectionDiffSegment[] {
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    const needsWordSeparator = segment.kind === 'removed'
      && nextSegment?.kind === 'added'
      && /[\p{L}\p{N}]$/u.test(segment.text)
      && /^[\p{L}\p{N}]/u.test(nextSegment.text);
    return needsWordSeparator
      ? { ...segment, text: `${segment.text} ` }
      : segment;
  });
}

function createComparisonSlice(
  editor: Editor,
  segments: AiSelectionDiffSegment[],
): Slice | null {
  const paragraphType = editor.schema.nodes['paragraph'];
  if (!paragraphType) return null;

  const comparisonText = segments.map(segment => segment.text).join('');
  const paragraphs = comparisonText.split(/\r?\n/u).map(line => paragraphType.create(
    null,
    line ? editor.schema.text(line) : undefined,
  ));
  return Slice.maxOpen(Fragment.fromArray(paragraphs));
}

function createComparisonDecorations(
  document: ProseMirrorNode,
  selection: { from: number; to: number },
  segments: AiSelectionDiffSegment[],
): Decoration[] {
  const styleRuns = segments
    .map(segment => ({
      kind: segment.kind,
      length: segment.text.replace(/\r?\n/gu, '').length,
    }))
    .filter(run => run.length > 0);
  const decorations: Decoration[] = [];
  let runIndex = 0;
  let consumedInRun = 0;

  document.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isText || !node.text) return;

    const textFrom = Math.max(selection.from, position);
    const textTo = Math.min(selection.to, position + node.nodeSize);
    let textPosition = textFrom;

    while (textPosition < textTo && runIndex < styleRuns.length) {
      const run = styleRuns[runIndex];
      const availableInRun = run.length - consumedInRun;
      const decorationLength = Math.min(availableInRun, textTo - textPosition);
      if (run.kind !== 'unchanged') {
        decorations.push(Decoration.inline(
          textPosition,
          textPosition + decorationLength,
          { class: `ai-selection-comparison-${run.kind}` },
        ));
      }
      textPosition += decorationLength;
      consumedInRun += decorationLength;
      if (consumedInRun === run.length) {
        runIndex += 1;
        consumedInRun = 0;
      }
    }
  });

  return decorations;
}

function buildSelectionEditAiPrompt(options: {
  context: SelectionEditContext;
  request: AiSelectionEditRequest;
}): BuiltAiPrompt {
  return buildAiPrompt({
    requestType: options.request.category,
    messages: [{
      role: 'user',
      parts: [
        {
          type: 'section',
          name: 'STORY CONTEXT',
          content: options.context.storyContext,
        },
        {
          type: 'text',
          content: [
            `Instruction: ${options.request.instruction}`,
            'Edit only the marked passage. Use the surrounding scene for continuity.',
            'Return only its replacement text.',
          ].join('\n'),
        },
      ],
    }],
  });
}

function mapSelection(
  selection: { from: number; to: number },
  transaction: Transaction,
): { from: number; to: number } {
  return {
    from: transaction.mapping.map(selection.from, 1),
    to: transaction.mapping.map(selection.to, -1),
  };
}

function mapReplacedSelection(
  selection: { from: number; to: number },
  transaction: Transaction,
): { from: number; to: number } {
  return {
    from: transaction.mapping.map(selection.from, -1),
    to: transaction.mapping.map(selection.to, 1),
  };
}

function transactionTouchesSelection(
  transaction: Transaction,
  selection: { from: number; to: number },
): boolean {
  if (!transaction.docChanged) return false;

  let currentSelection = selection;
  let touchesSelection = false;

  transaction.steps.forEach((step, index) => {
    if (!touchesSelection && stepTouchesSelection(
      step,
      currentSelection,
      transaction.docs[index],
    )) {
      touchesSelection = true;
    }
    currentSelection = {
      from: step.getMap().map(currentSelection.from, 1),
      to: step.getMap().map(currentSelection.to, -1),
    };
  });

  return touchesSelection;
}

function stepTouchesSelection(
  step: Transaction['steps'][number],
  selection: { from: number; to: number },
  doc: Transaction['before'],
): boolean {
  let hasMappedRange = false;
  let touchesSelection = false;

  step.getMap().forEach((oldStart, oldEnd) => {
    hasMappedRange = true;
    if (oldStart === oldEnd) {
      if (oldStart > selection.from && oldStart < selection.to) touchesSelection = true;
    } else if (oldStart < selection.to && oldEnd > selection.from) {
      touchesSelection = true;
    }
  });

  if (hasMappedRange) return touchesSelection;

  const rangedStep = step as typeof step & { from?: number; to?: number; pos?: number };
  if (typeof rangedStep.from === 'number' && typeof rangedStep.to === 'number') {
    return rangedStep.from < selection.to && rangedStep.to > selection.from;
  }
  if (typeof rangedStep.pos === 'number') {
    const affectedNode = doc.nodeAt(rangedStep.pos);
    if (affectedNode) {
      return rangedStep.pos < selection.to &&
        rangedStep.pos + affectedNode.nodeSize > selection.from;
    }
    return rangedStep.pos > selection.from && rangedStep.pos < selection.to;
  }
  return false;
}
