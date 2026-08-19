import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { Fragment, Node as ProseMirrorNode, Schema, Slice } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import type { Transaction } from '@tiptap/pm/state';
import type { ActDto } from '../../../../../../shared/models/manuscript.model';

import { AiGenerationSessionService } from '../../../../core/services/ai-generation-session.service';
import { buildAiPrompt } from '../../../../shared/utils/ai-prompt-builder';
import {
  buildSelectionEditContext,
  serializeCodexContext,
  serializePartialOutline,
  type SelectionEditAdditionalContext,
  type SelectionEditContext,
} from '../../../../shared/utils/story-context-builder';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { CodexService } from '../../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import { AiStreamEditorService } from './ai-stream-editor.service';
import {
  buildAiSelectionDiff,
  type AiSelectionDiffSegment,
} from '../../components/ai-selection-effect/ai-selection-diff';

export type AiSelectionEditCategory = 'rephrase' | 'expand' | 'shorten';
export type AiSelectionEditState = 'drawing' | 'generating' | 'ready';

export interface AiSelectionEditRequest {
  category: AiSelectionEditCategory;
  instruction: string;
  actionLabel: 'Rephrase' | 'Expand' | 'Shorten' | 'Other';
}

export interface AiSelectionRange {
  from: number;
  to: number;
}

interface SelectionAnchorPoint {
  blockId: string | null;
  blockIndex: number;
  offset: number;
}

interface SelectionAnchor {
  start: SelectionAnchorPoint;
  end: SelectionAnchorPoint;
}

export interface AiSelectionEditSession {
  id: string;
  bookId: string;
  sceneId: string;
  request: AiSelectionEditRequest;
  activityLabel: string;
  state: WritableSignal<AiSelectionEditState>;
  comparisonSegments: WritableSignal<AiSelectionDiffSegment[]>;
  isComparisonVisible: WritableSignal<boolean>;
  generatedContent: WritableSignal<string>;
  attachedEditor: Editor | null;
  selection: AiSelectionRange | null;
  previewSelection: AiSelectionRange | null;
}

interface ManagedSelectionEdit extends AiSelectionEditSession {
  anchor: SelectionAnchor;
  originalSliceJson: unknown;
  candidateSliceJson: unknown | null;
  comparisonSliceJson: unknown | null;
  schema: Schema;
  documentSnapshotJson: Record<string, unknown>;
  selectionSnapshot: AiSelectionRange;
  baseContext: SelectionEditContext;
  parseMarkdown: (markdown: string) => Record<string, unknown>;
  bookTitle: string | undefined;
  drawTimer: ReturnType<typeof setTimeout> | null;
  isInternalUpdate: boolean;
  isCancelling: boolean;
}

interface StartSelectionEditRequest {
  editor: Editor;
  bookId: string;
  bookTitle: string | undefined;
  request: AiSelectionEditRequest;
}

const DRAW_DURATION_MS = 600;

@Injectable({ providedIn: 'root' })
export class AiSelectionEditService {
  private readonly generationSessions = inject(AiGenerationSessionService);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly codexContext = inject(CodexContextTrieService);
  private readonly codexService = inject(CodexService);
  private readonly manuscriptStructureService = inject(ManuscriptStructureService);

  private readonly managedEdits = new Map<string, ManagedSelectionEdit>();
  readonly sessions = signal<readonly AiSelectionEditSession[]>([]);

  startEdit({ editor, bookId, bookTitle, request }: StartSelectionEditRequest): string | null {
    const instruction = request.instruction.trim();
    const selection = editor.state.selection;
    if (!instruction || selection.empty || selection.from === selection.to) return null;

    const selectionSnapshot = { from: selection.from, to: selection.to };
    const documentSnapshot = editor.state.doc;
    const context = buildSelectionEditContext(documentSnapshot, selectionSnapshot);
    if (!context) return null;

    const anchor = createSelectionAnchor(documentSnapshot, context.sceneId, selectionSnapshot);
    if (!anchor) return null;

    const id = crypto.randomUUID();
    if (!this.aiStreamEditor.acquireSceneGeneration({ sceneId: context.sceneId, ownerId: id })) {
      return null;
    }

    const normalizedRequest = { ...request, instruction };
    const originalSlice = documentSnapshot.slice(selection.from, selection.to);
    const edit: ManagedSelectionEdit = {
      id,
      bookId,
      sceneId: context.sceneId,
      request: normalizedRequest,
      activityLabel: selectionEditActivityLabel(normalizedRequest.actionLabel),
      state: signal<AiSelectionEditState>('drawing'),
      comparisonSegments: signal<AiSelectionDiffSegment[]>([]),
      isComparisonVisible: signal(false),
      generatedContent: signal(''),
      attachedEditor: editor,
      selection: selectionSnapshot,
      previewSelection: null,
      anchor,
      originalSliceJson: originalSlice.toJSON(),
      candidateSliceJson: null,
      comparisonSliceJson: null,
      schema: editor.schema,
      documentSnapshotJson: documentSnapshot.toJSON(),
      selectionSnapshot,
      baseContext: context,
      parseMarkdown: markdown => editor.markdown!.parse(markdown) as Record<string, unknown>,
      bookTitle,
      drawTimer: null,
      isInternalUpdate: false,
      isCancelling: false,
    };

    this.managedEdits.set(id, edit);
    this.publishSessions();
    edit.drawTimer = setTimeout(() => {
      edit.drawTimer = null;
      if (!this.managedEdits.has(id) || edit.state() !== 'drawing') return;
      edit.state.set('generating');
      void this.generateEdit(edit);
    }, DRAW_DURATION_MS);

    return id;
  }

  getSession(id: string): AiSelectionEditSession | null {
    return this.managedEdits.get(id) ?? null;
  }

  sessionsForBook(bookId: string): readonly AiSelectionEditSession[] {
    this.sessions();
    return [...this.managedEdits.values()].filter(edit => edit.bookId === bookId);
  }

  attachEditor(editor: Editor, bookId: string): void {
    for (const edit of this.managedEdits.values()) {
      if (edit.bookId === bookId && edit.attachedEditor !== editor) {
        const selection = resolveSelectionAnchor(editor.state.doc, edit.sceneId, edit.anchor);
        if (selection) {
          edit.attachedEditor = editor;
          edit.selection = selection;
          edit.previewSelection = null;
          if (edit.state() === 'ready' && edit.candidateSliceJson) {
            this.previewSlice(edit, sliceFromJson(editor.schema, edit.candidateSliceJson));
          }
        }
      }
    }
    this.publishSessions();
  }

  detachEditor(editor: Editor): void {
    for (const edit of this.managedEdits.values()) {
      if (edit.attachedEditor === editor) {
        this.restoreOriginalPreview(edit);
        if (edit.selection) {
          edit.anchor = createSelectionAnchor(editor.state.doc, edit.sceneId, edit.selection)
            ?? edit.anchor;
        }
        edit.attachedEditor = null;
        edit.selection = null;
        edit.previewSelection = null;
      }
    }
    this.publishSessions();
  }

  mapAttachedSelection(id: string, transaction: Transaction): void {
    const edit = this.managedEdits.get(id);
    if (!edit?.selection || edit.isInternalUpdate || !transaction.docChanged) return;

    edit.selection = mapSelection(edit.selection, transaction);
    if (edit.previewSelection) edit.previewSelection = edit.selection;
    edit.anchor = createSelectionAnchor(transaction.doc, edit.sceneId, edit.selection) ?? edit.anchor;
  }

  isInternalUpdate(id: string): boolean {
    return this.managedEdits.get(id)?.isInternalUpdate === true;
  }

  async cancel(id: string): Promise<void> {
    const edit = this.managedEdits.get(id);
    if (!edit || edit.isCancelling) return;

    edit.isCancelling = true;
    if (edit.drawTimer !== null) clearTimeout(edit.drawTimer);
    edit.drawTimer = null;
    this.restoreOriginalPreview(edit);
    this.managedEdits.delete(id);
    this.publishSessions();

    const activeSession = this.generationSessions.getSession(id);
    if (activeSession) {
      await this.generationSessions.stop(id);
      await activeSession.completion;
    }
    this.aiStreamEditor.releaseSceneGeneration({ sceneId: edit.sceneId, ownerId: edit.id });
    this.generationSessions.release(edit.id);
  }

  confirm(id: string): boolean {
    const edit = this.managedEdits.get(id);
    const editor = edit?.attachedEditor;
    if (!edit || !editor || !edit.candidateSliceJson || !edit.previewSelection) return false;

    this.restoreOriginalPreview(edit);
    if (!edit.selection) return false;

    const candidate = sliceFromJson(editor.schema, edit.candidateSliceJson);
    const transaction = closeHistory(editor.state.tr.replaceRange(
      edit.selection.from,
      edit.selection.to,
      candidate,
    ));
    this.dispatchInternal(edit, transaction);
    editor.commands.focus();
    this.removeEdit(edit);
    return true;
  }

  toggleComparison(id: string): boolean {
    const edit = this.managedEdits.get(id);
    const editor = edit?.attachedEditor;
    if (!edit || !editor || edit.state() !== 'ready' || !edit.previewSelection) return false;

    if (edit.isComparisonVisible()) {
      if (!edit.candidateSliceJson) return false;
      this.replacePreview(edit, sliceFromJson(editor.schema, edit.candidateSliceJson));
      edit.isComparisonVisible.set(false);
      return true;
    }

    const segments = createInlineComparisonSegments(edit.comparisonSegments());
    const comparisonSlice = createComparisonSlice(editor, segments);
    if (!comparisonSlice) return false;
    edit.comparisonSliceJson = comparisonSlice.toJSON();
    this.replacePreview(edit, comparisonSlice);
    edit.isComparisonVisible.set(true);
    return true;
  }

  persistenceSafeDocument(editor: Editor): ProseMirrorNode {
    const previews = [...this.managedEdits.values()]
      .filter(edit => edit.attachedEditor === editor && edit.previewSelection)
      .sort((left, right) => right.previewSelection!.from - left.previewSelection!.from);
    if (previews.length === 0) return editor.state.doc;

    const transaction = editor.state.tr;
    for (const edit of previews) {
      const preview = edit.previewSelection!;
      transaction.replaceRange(
        preview.from,
        preview.to,
        sliceFromJson(editor.schema, edit.originalSliceJson),
      );
    }
    return transaction.doc;
  }

  cancelForSceneIds(sceneIds: ReadonlySet<string>): void {
    const ids = [...this.managedEdits.values()]
      .filter(edit => sceneIds.has(edit.sceneId))
      .map(edit => edit.id);
    ids.forEach(id => void this.cancel(id));
  }

  cancelForEntity({
    entityType,
    entityId,
    hierarchy,
  }: {
    entityType: 'act' | 'chapter' | 'scene';
    entityId: string;
    hierarchy: readonly ActDto[];
  }): void {
    const sceneIds = new Set<string>();
    for (const act of hierarchy) {
      if (entityType !== 'act' || act.id === entityId) {
        for (const chapter of act.chapters ?? []) {
          if (entityType !== 'chapter' || chapter.id === entityId) {
            for (const scene of chapter.scenes ?? []) {
              if (entityType !== 'scene' || scene.id === entityId) sceneIds.add(scene.id);
            }
          }
        }
      }
    }
    this.cancelForSceneIds(sceneIds);
  }

  private async generateEdit(edit: ManagedSelectionEdit): Promise<void> {
    try {
      let context = edit.baseContext;
      if (edit.request.category === 'expand' || edit.request.category === 'shorten') {
        const additionalContext = await this.prepareExtendedContext(edit);
        if (!this.managedEdits.has(edit.id) || edit.state() !== 'generating') return;

        const documentSnapshot = edit.schema.nodeFromJSON(edit.documentSnapshotJson);
        const enrichedContext = buildSelectionEditContext(
          documentSnapshot,
          edit.selectionSnapshot,
          additionalContext,
        );
        if (!enrichedContext) throw new Error('Could not rebuild the selection edit prompt.');
        context = enrichedContext;
      }

      const generation = this.generationSessions.start({
        streamId: edit.id,
        source: 'manuscript-selection',
        scopeId: edit.sceneId,
        activityLabel: edit.activityLabel,
        bookId: edit.bookId,
        suppressErrorToasts: true,
        aiPrompt: buildSelectionEditAiPrompt({ context, request: edit.request }),
        onContentChange: content => edit.generatedContent.set(content),
      });
      if (!generation) {
        this.removeEdit(edit);
        return;
      }

      const result = await generation.completion;
      if (!this.managedEdits.has(edit.id)) return;
      if (result.status === 'stopped') {
        this.removeEdit(edit);
        return;
      }
      if (result.status === 'failed') throw result.error ?? new Error('AI selection edit failed.');

      const replacement = result.content.trim();
      if (!replacement) {
        this.removeEdit(edit);
        return;
      }

      const candidate = this.parseCandidateSlice(edit, replacement);
      if (!candidate) {
        this.removeEdit(edit);
        return;
      }

      edit.generatedContent.set(replacement);
      edit.candidateSliceJson = candidate.toJSON();
      if (edit.request.category === 'rephrase') {
        const original = sliceFromJson(edit.schema, edit.originalSliceJson);
        edit.comparisonSegments.set(buildAiSelectionDiff(sliceText(original), sliceText(candidate)));
      }
      edit.state.set('ready');
      if (edit.attachedEditor && edit.selection) this.previewSlice(edit, candidate);
    } catch (error) {
      if (!this.managedEdits.has(edit.id)) return;
      console.error(`AI ${edit.request.actionLabel.toLowerCase()} failed:`, error);
      this.removeEdit(edit);
    } finally {
      this.generationSessions.release(edit.id);
    }
  }

  private async prepareExtendedContext(
    edit: ManagedSelectionEdit,
  ): Promise<SelectionEditAdditionalContext> {
    if (!this.codexContext.trie() || this.codexContext.isLoading() || this.codexContext.error()) {
      throw new Error('Codex context is not available.');
    }

    const detectedEntryIds = new Set(
      this.codexContext.findMatches(edit.baseContext.selectedProse)
        .filter(match => match.value.status === 'active' && (
          match.value.trackingSetting === 'include_when_detected'
          || match.value.trackingSetting === 'always_include'
        ))
        .map(match => match.value.entryId),
    );
    const [outline, codexEntries] = await Promise.all([
      this.manuscriptStructureService.getOutline(edit.bookId),
      Promise.all([...detectedEntryIds].map(id => this.codexService.getEntry(id))),
    ]);
    if (codexEntries.some(entry => entry === undefined)) {
      throw new Error('A detected Codex entry could not be loaded.');
    }

    return {
      partialOutline: serializePartialOutline(
        outline,
        edit.bookTitle,
        edit.sceneId,
        { currentSceneProse: edit.baseContext.sceneContent },
      ),
      codexContext: serializeCodexContext(
        codexEntries.filter(entry => entry !== undefined),
        outline,
        edit.sceneId,
      ),
      sceneIncludedInOutline: true,
    };
  }

  private parseCandidateSlice(edit: ManagedSelectionEdit, markdown: string): Slice | null {
    try {
      const parsedDocument = edit.parseMarkdown(markdown);
      const parsedNode = edit.schema.nodeFromJSON(parsedDocument);
      if (parsedNode.content.size === 0) return null;
      return Slice.maxOpen(parsedNode.content);
    } catch (error) {
      console.warn('Failed to parse AI selection edit Markdown:', error);
      return null;
    }
  }

  private previewSlice(edit: ManagedSelectionEdit, slice: Slice): void {
    const editor = edit.attachedEditor;
    const original = edit.selection;
    if (!editor || !original) return;

    const transaction = editor.state.tr.replaceRange(original.from, original.to, slice);
    const previewSelection = mapReplacedSelection(original, transaction);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('skipSaver', true);
    this.dispatchInternal(edit, transaction);
    edit.previewSelection = previewSelection;
    edit.selection = previewSelection;
    edit.anchor = createSelectionAnchor(editor.state.doc, edit.sceneId, previewSelection) ?? edit.anchor;
  }

  private replacePreview(edit: ManagedSelectionEdit, replacement: Slice): void {
    const editor = edit.attachedEditor;
    const preview = edit.previewSelection;
    if (!editor || !preview) return;

    const transaction = editor.state.tr.replaceRange(preview.from, preview.to, replacement);
    const replacementSelection = mapReplacedSelection(preview, transaction);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('skipSaver', true);
    this.dispatchInternal(edit, transaction);
    edit.previewSelection = replacementSelection;
    edit.selection = replacementSelection;
  }

  private restoreOriginalPreview(edit: ManagedSelectionEdit): void {
    const editor = edit.attachedEditor;
    const preview = edit.previewSelection;
    if (!editor || !preview) return;

    const original = sliceFromJson(editor.schema, edit.originalSliceJson);
    const transaction = editor.state.tr.replaceRange(preview.from, preview.to, original);
    const restoredSelection = mapReplacedSelection(preview, transaction);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('skipSaver', true);
    this.dispatchInternal(edit, transaction);
    edit.previewSelection = null;
    edit.selection = restoredSelection;
    edit.isComparisonVisible.set(false);
  }

  private dispatchInternal(edit: ManagedSelectionEdit, transaction: Transaction): void {
    const editor = edit.attachedEditor;
    if (!editor) return;

    edit.isInternalUpdate = true;
    try {
      editor.view.dispatch(transaction);
    } finally {
      edit.isInternalUpdate = false;
    }
  }

  private removeEdit(edit: ManagedSelectionEdit): void {
    if (!this.managedEdits.has(edit.id)) return;
    if (edit.drawTimer !== null) clearTimeout(edit.drawTimer);
    this.restoreOriginalPreview(edit);
    this.managedEdits.delete(edit.id);
    this.aiStreamEditor.releaseSceneGeneration({ sceneId: edit.sceneId, ownerId: edit.id });
    this.generationSessions.release(edit.id);
    this.publishSessions();
  }

  private publishSessions(): void {
    this.sessions.set([...this.managedEdits.values()]);
  }
}

function createSelectionAnchor(
  doc: ProseMirrorNode,
  sceneId: string,
  selection: AiSelectionRange,
): SelectionAnchor | null {
  let currentSceneId: string | null = null;
  let blockIndex = -1;
  let start: SelectionAnchorPoint | null = null;
  let end: SelectionAnchorPoint | null = null;

  doc.descendants((node, position) => {
    if (node.type.name === 'sceneSummary') {
      currentSceneId = String(node.attrs['id'] ?? '');
      blockIndex = -1;
      return false;
    }
    if (node.type.name === 'actHeader' || node.type.name === 'chapterHeader') {
      currentSceneId = null;
      blockIndex = -1;
      return false;
    }
    if (currentSceneId !== sceneId || !node.isTextblock) return true;

    blockIndex += 1;

    const contentFrom = position + 1;
    const contentTo = contentFrom + node.content.size;
    if (!start && selection.from >= contentFrom && selection.from <= contentTo) {
      start = {
        blockId: node.attrs['id'] ? String(node.attrs['id']) : null,
        blockIndex,
        offset: selection.from - contentFrom,
      };
    }
    if (selection.to >= contentFrom && selection.to <= contentTo) {
      end = {
        blockId: node.attrs['id'] ? String(node.attrs['id']) : null,
        blockIndex,
        offset: selection.to - contentFrom,
      };
    }
    return true;
  });

  return start && end ? { start, end } : null;
}

function resolveSelectionAnchor(
  doc: ProseMirrorNode,
  sceneId: string,
  anchor: SelectionAnchor,
): AiSelectionRange | null {
  let currentSceneId: string | null = null;
  let blockIndex = -1;
  let from: number | null = null;
  let to: number | null = null;

  doc.descendants((node, position) => {
    if (node.type.name === 'sceneSummary') {
      currentSceneId = String(node.attrs['id'] ?? '');
      blockIndex = -1;
      return false;
    }
    if (node.type.name === 'actHeader' || node.type.name === 'chapterHeader') {
      currentSceneId = null;
      blockIndex = -1;
      return false;
    }
    if (currentSceneId !== sceneId || !node.isTextblock) return true;

    blockIndex += 1;
    const blockId = String(node.attrs['id'] ?? '');
    const isStartBlock = anchor.start.blockId
      ? blockId === anchor.start.blockId
      : blockIndex === anchor.start.blockIndex;
    const isEndBlock = anchor.end.blockId
      ? blockId === anchor.end.blockId
      : blockIndex === anchor.end.blockIndex;
    if (isStartBlock && anchor.start.offset <= node.content.size) {
      from = position + 1 + anchor.start.offset;
    }
    if (isEndBlock && anchor.end.offset <= node.content.size) {
      to = position + 1 + anchor.end.offset;
    }
    return from === null || to === null;
  });

  return from !== null && to !== null && from < to ? { from, to } : null;
}

function selectionEditActivityLabel(action: AiSelectionEditRequest['actionLabel']): string {
  switch (action) {
    case 'Rephrase': return 'Rephrasing prose';
    case 'Expand': return 'Expanding prose';
    case 'Shorten': return 'Shortening prose';
    case 'Other': return 'Editing prose';
  }
}

function buildSelectionEditAiPrompt({
  context,
  request,
}: {
  context: SelectionEditContext;
  request: AiSelectionEditRequest;
}) {
  return buildAiPrompt({
    requestType: request.category,
    messages: [{
      role: 'user',
      parts: [
        { type: 'section', name: 'STORY CONTEXT', content: context.storyContext },
        {
          type: 'text',
          content: [
            `Instruction: ${request.instruction}`,
            'Edit only the marked passage. Use the surrounding scene for continuity.',
          ].join('\n'),
        },
      ],
    }],
  });
}

function sliceFromJson(schema: Schema, json: unknown): Slice {
  return Slice.fromJSON(schema, json as { content: unknown; openStart: number; openEnd: number });
}

function sliceText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, '\n');
}

function mapSelection(selection: AiSelectionRange, transaction: Transaction): AiSelectionRange {
  return {
    from: transaction.mapping.map(selection.from, 1),
    to: transaction.mapping.map(selection.to, -1),
  };
}

function mapReplacedSelection(
  selection: AiSelectionRange,
  transaction: Transaction,
): AiSelectionRange {
  return {
    from: transaction.mapping.map(selection.from, -1),
    to: transaction.mapping.map(selection.to, 1),
  };
}

export function createInlineComparisonSegments(
  segments: AiSelectionDiffSegment[],
): AiSelectionDiffSegment[] {
  return segments.map((segment, index) => {
    const nextSegment = segments[index + 1];
    const needsWordSeparator = segment.kind === 'removed'
      && nextSegment?.kind === 'added'
      && /[\p{L}\p{N}]$/u.test(segment.text)
      && /^[\p{L}\p{N}]/u.test(nextSegment.text);
    return needsWordSeparator ? { ...segment, text: `${segment.text} ` } : segment;
  });
}

function createComparisonSlice(editor: Editor, segments: AiSelectionDiffSegment[]): Slice | null {
  const paragraphType = editor.schema.nodes['paragraph'];
  if (!paragraphType) return null;

  const comparisonText = segments.map(segment => segment.text).join('');
  const paragraphs = comparisonText.split(/\r?\n/u).map(line => paragraphType.create(
    null,
    line ? editor.schema.text(line) : undefined,
  ));
  return Slice.maxOpen(Fragment.fromArray(paragraphs));
}
