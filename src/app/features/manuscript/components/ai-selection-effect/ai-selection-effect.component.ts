import {
  Component,
  EventEmitter,
  Input,
  NgZone,
  Output,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { WorkspaceStore } from '../../../workspace/workspace.store';
import {
  AiSelectionEditService,
  createInlineComparisonSegments,
  type AiSelectionEditRequest,
  type AiSelectionRange,
} from '../../helpers/ai/ai-selection-edit.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import type { AiSelectionDiffSegment } from './ai-selection-diff';

export type {
  AiSelectionEditCategory,
  AiSelectionEditRequest,
  AiSelectionEditState,
} from '../../helpers/ai/ai-selection-edit.service';

interface AiSelectionBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

const EFFECT_PADDING = 10;
const EFFECT_ACTIONS_HEIGHT = 48;
const EFFECT_READY_MIN_WIDTH = 280;

@Component({
  selector: 'app-ai-selection-effect',
  standalone: true,
  templateUrl: './ai-selection-effect.component.html',
  styleUrl: './ai-selection-effect.component.scss',
})
export class AiSelectionEffectComponent {
  @Output() readonly dismissed = new EventEmitter<void>();

  private readonly requestedSessionId = signal('');

  @Input()
  set sessionId(value: string) {
    this.requestedSessionId.set(value);
  }

  get sessionId(): string {
    return this.requestedSessionId();
  }

  readonly bounds = signal<AiSelectionBounds | null>(null);
  readonly clipPath = signal<string | null>(null);
  readonly state = computed(() => this.session()?.state() ?? 'idle');
  readonly comparisonSegments = computed(() => this.session()?.comparisonSegments() ?? []);
  readonly isComparisonVisible = computed(() => this.session()?.isComparisonVisible() ?? false);
  readonly canCompare = computed(() => (
    this.state() === 'ready' && this.comparisonSegments().length > 0
  ));
  readonly frameHeight = computed(() => {
    const currentBounds = this.bounds();
    if (!currentBounds) return 0;
    return this.state() === 'ready'
      ? currentBounds.height + EFFECT_ACTIONS_HEIGHT
      : currentBounds.height;
  });

  private readonly store = inject(ManuscriptStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly selectionEdits = inject(AiSelectionEditService);
  private readonly zone = inject(NgZone);
  private readonly spacingPluginKey = new PluginKey('aiSelectionSpacing');

  get streamId(): string {
    return this.requestedSessionId();
  }

  constructor() {
    effect((onCleanup) => {
      const editor = this.store.editor();
      if (!editor) return;

      editor.on('selectionUpdate', this.onSelectionUpdate);
      editor.on('update', this.onEditorUpdate);
      window.addEventListener('resize', this.onViewportChange);
      window.addEventListener('scroll', this.onViewportChange, true);

      onCleanup(() => {
        editor.off('selectionUpdate', this.onSelectionUpdate);
        editor.off('update', this.onEditorUpdate);
        window.removeEventListener('resize', this.onViewportChange);
        window.removeEventListener('scroll', this.onViewportChange, true);
      });
    });

    effect((onCleanup) => {
      const session = this.session();
      const editor = session?.attachedEditor;
      if (!session || !editor || !session.selection) {
        this.bounds.set(null);
        this.clipPath.set(null);
        return;
      }

      this.refreshSelectionSpacing();
      this.updatePosition();
      onCleanup(() => editor.unregisterPlugin(this.spacingPluginKey));
    });
  }

  startEdit(request: AiSelectionEditRequest): boolean {
    if (this.session()) return false;
    const editor = this.store.editor();
    const bookId = this.workspaceStore.bookId();
    if (!editor || !bookId) return false;

    const id = this.selectionEdits.startEdit({
      editor,
      bookId,
      bookTitle: this.workspaceStore.bookTitle(),
      request,
    });
    if (!id) return false;

    this.requestedSessionId.set(id);
    this.refreshSelectionSpacing();
    this.updatePosition();
    window.getSelection()?.removeAllRanges();
    return true;
  }

  async cancel(): Promise<void> {
    const id = this.requestedSessionId();
    if (!id) return;
    this.removeSelectionSpacing();
    await this.selectionEdits.cancel(id);
    this.dismissed.emit();
  }

  confirm(): void {
    const id = this.requestedSessionId();
    if (!id) return;
    this.removeSelectionSpacing();
    if (this.selectionEdits.confirm(id)) this.dismissed.emit();
  }

  toggleComparison(): void {
    const id = this.requestedSessionId();
    if (!id || !this.selectionEdits.toggleComparison(id)) return;
    this.refreshSelectionSpacing();
    this.updatePosition();
  }

  focusSession(sessionId: string): boolean {
    if (this.requestedSessionId() !== sessionId) return false;
    const session = this.session();
    const editor = session?.attachedEditor;
    const selection = session?.selection;
    if (!editor || !selection) return false;

    const selectionRect = this.getRangeRect(editor, selection);
    const viewport = editor.view.dom.closest<HTMLElement>('.editor-content-wrapper');
    if (!selectionRect || !viewport) return false;

    const viewportRect = viewport.getBoundingClientRect();
    const centeredTop = selectionRect.top
      - viewportRect.top
      + viewport.scrollTop
      - (viewport.clientHeight - selectionRect.height) / 2;
    viewport.scrollTo({ top: Math.max(0, centeredTop), behavior: 'smooth' });
    return true;
  }

  private session() {
    this.selectionEdits.sessions();
    return this.selectionEdits.getSession(this.requestedSessionId());
  }

  private readonly onSelectionUpdate = () => {
    this.zone.run(() => this.updatePosition());
  };

  private readonly onEditorUpdate = (event?: { transaction: Transaction }) => {
    this.zone.run(() => {
      const id = this.requestedSessionId();
      if (this.selectionEdits.isInternalUpdate(id)) return;
      if (event?.transaction.docChanged) {
        this.selectionEdits.mapAttachedSelection(id, event.transaction);
        this.refreshSelectionSpacing();
      }
      this.updatePosition();
    });
  };

  private readonly onViewportChange = () => {
    this.zone.run(() => this.updatePosition());
  };

  private updatePosition(): boolean {
    const session = this.session();
    const editor = session?.attachedEditor;
    const selection = session?.selection;
    if (!editor || !selection) return false;

    const rect = this.getRangeRect(editor, selection);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    const effectBounds = {
      top: rect.top - EFFECT_PADDING,
      left: rect.left - EFFECT_PADDING,
      width: rect.width + EFFECT_PADDING * 2,
      height: rect.height + EFFECT_PADDING * 2,
    };
    const viewport = editor.view.dom.closest('.editor-content-wrapper');
    if (!viewport) return false;

    this.bounds.set(effectBounds);
    this.clipPath.set(this.getClipPath(effectBounds, viewport.getBoundingClientRect()));
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

  private getRangeRect(editor: Editor, selection: AiSelectionRange): DOMRect | null {
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

  private refreshSelectionSpacing(): void {
    const session = this.session();
    const editor = session?.attachedEditor;
    const selection = session?.selection;
    if (!editor || !selection) return;

    editor.unregisterPlugin(this.spacingPluginKey);
    const comparisonSegments = session.isComparisonVisible()
      ? createInlineComparisonSegments(session.comparisonSegments())
      : undefined;
    editor.registerPlugin(new Plugin({
      key: this.spacingPluginKey,
      filterTransaction: transaction => (
        this.selectionEdits.isInternalUpdate(session.id)
        || !transactionTouchesSelection(transaction, selection)
      ),
      props: {
        decorations: state => {
          const decorations: Decoration[] = [Decoration.inline(selection.from, selection.to, {
            class: `ai-selection-spacing${session.state() !== 'ready' ? ' ai-selection-generating' : ''}`,
          })];
          if (comparisonSegments) {
            decorations.push(...createComparisonDecorations(
              state.doc,
              selection,
              comparisonSegments,
            ));
          }
          if (session.state() === 'ready') {
            decorations.push(Decoration.widget(selection.to, () => {
              const spacer = document.createElement('span');
              spacer.className = 'ai-selection-action-spacer';
              spacer.contentEditable = 'false';
              spacer.style.height = `${EFFECT_ACTIONS_HEIGHT}px`;
              return spacer;
            }, { side: 1 }));
          }
          return DecorationSet.create(state.doc, decorations);
        },
      },
    }));
  }

  private removeSelectionSpacing(): void {
    this.session()?.attachedEditor?.unregisterPlugin(this.spacingPluginKey);
  }
}

function createComparisonDecorations(
  document: ProseMirrorNode,
  selection: AiSelectionRange,
  segments: AiSelectionDiffSegment[],
): Decoration[] {
  const styleRuns = segments
    .map(segment => ({ kind: segment.kind, length: segment.text.replace(/\r?\n/gu, '').length }))
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
      const decorationLength = Math.min(run.length - consumedInRun, textTo - textPosition);
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

function transactionTouchesSelection(
  transaction: Transaction,
  selection: AiSelectionRange,
): boolean {
  if (!transaction.docChanged) return false;

  let currentSelection = selection;
  let touchesSelection = false;
  transaction.steps.forEach((step, index) => {
    if (!touchesSelection && stepTouchesSelection(step, currentSelection, transaction.docs[index])) {
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
  selection: AiSelectionRange,
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
      return rangedStep.pos < selection.to
        && rangedStep.pos + affectedNode.nodeSize > selection.from;
    }
    return rangedStep.pos > selection.from && rangedStep.pos < selection.to;
  }
  return false;
}
