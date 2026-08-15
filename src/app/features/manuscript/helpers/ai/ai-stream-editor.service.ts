import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

import { AiGenerationSession, AiGenerationSessionService } from '../../../../core/services/ai-generation-session.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { ToastService } from '../../../../shared/services/toast.service';
import type { BuiltAiPrompt } from '../../../../shared/utils/ai-prompt-builder';
import type { TiptapJsonDoc, TiptapNode } from '../../../../../../shared/models/manuscript.model';
import { extractTextFromJsonNode } from '../content/manuscript-content.utils';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import { ManuscriptStore } from '../../store/manuscript.store';

type GeneratedBlockAttrs = Record<string, any>;

export interface GenerateNewBlockRequest {
  editor: Editor;
  insertPos: number;
  aiPrompt: BuiltAiPrompt;
  provider: string;
  modelId: string;
  reasoningMode: boolean;
  bookId: string;
  responseId: string;
  sourcePromptId: string;
  sceneId: string;
}

export interface RegenerateExistingBlockRequest {
  editor: Editor;
  blockPos: number;
  currentAttrs: GeneratedBlockAttrs;
  aiPrompt: BuiltAiPrompt;
  provider: string;
  modelId: string;
  reasoningMode: boolean;
  bookId: string;
  promptText: string;
  sceneId: string;
}

interface ActiveManuscriptGeneration {
  blockId: string;
  sceneId: string;
  blockAttrs: GeneratedBlockAttrs;
  session: AiGenerationSession;
}

interface PersistCompletedGenerationRequest {
  sceneId: string;
  blockId: string;
  blockAttrs: GeneratedBlockAttrs;
  content: string;
  reasoning: string;
  removeBlock: boolean;
}

const AI_GENERATED_BLOCK_NODE = 'aiGeneratedBlock';
const PARAGRAPH_NODE = 'paragraph';

@Injectable({ providedIn: 'root' })
export class AiStreamEditorService {

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly generationSessions = inject(AiGenerationSessionService);
  private readonly electronService = inject(ElectronService);
  private readonly saver = inject(ManuscriptProseSaverService);
  private readonly manuscriptStore = inject(ManuscriptStore);
  private readonly toastService = inject(ToastService);


  // ---------------------------------------------------------------------------
  // Shared Stream State
  // ---------------------------------------------------------------------------

  public readonly loadingState = new Map<string, WritableSignal<LoadingStatus>>();
  private readonly activeGenerations = new Map<string, ActiveManuscriptGeneration>();
  private currentEditor: Editor | null = null;
  private viewChangeInProgress = false;


  // ---------------------------------------------------------------------------
  // Public Generation API
  // ---------------------------------------------------------------------------

  /**
   * Aborts the current AI generation for the given block.
   * Partial text already inserted into the editor is preserved and finalized.
   */
  async stopGeneration(blockId: string): Promise<void> {
    await this.generationSessions.stop(blockId);
  }

  async stopPromptGeneration(promptId: string): Promise<void> {
    const generation = [...this.activeGenerations.values()].find(activeGeneration => (
      activeGeneration.blockAttrs['sourcePromptId'] === promptId
      && this.isSessionActive(activeGeneration.session)
    ));
    if (!generation) return;

    await this.stopGeneration(generation.blockId);
  }

  hasActivePromptGeneration(promptId: string): boolean {
    return [...this.activeGenerations.values()].some(activeGeneration => (
      activeGeneration.blockAttrs['sourcePromptId'] === promptId
      && this.isSessionActive(activeGeneration.session)
    ));
  }

  ensurePromptLoadingState(promptId: string): WritableSignal<LoadingStatus> {
    const loadingSignal = this.loadingState.get(promptId) ?? signal<LoadingStatus>('idle');
    const generation = [...this.activeGenerations.values()].find(activeGeneration => (
      activeGeneration.blockAttrs['sourcePromptId'] === promptId
      && this.isSessionActive(activeGeneration.session)
    ));

    if (generation) loadingSignal.set(this.toLoadingStatus(generation.session.status()));
    this.loadingState.set(promptId, loadingSignal);
    return loadingSignal;
  }

  /** The shared AI transport currently supports one active generation at a time. */
  hasActiveGeneration(): boolean {
    return this.generationSessions.hasActiveSession();
  }

  attachEditor(editor: Editor): void {
    this.currentEditor = editor;
    this.syncActiveGenerations(editor);
  }

  detachEditor(editor: Editor): void {
    if (this.currentEditor === editor) this.currentEditor = null;
  }

  beginViewChange(): void {
    this.viewChangeInProgress = true;
  }

  endViewChange(): void {
    this.viewChangeInProgress = false;
  }

  syncActiveGenerations(editor: Editor): void {
    for (const generation of this.activeGenerations.values()) {
      const status = generation.session.status();
      const isTerminal = status === 'complete' || status === 'stopped' || status === 'failed';
      const blockPos = this.findGeneratingBlockPos(editor, generation.blockId);
      if (isTerminal) {
        if (blockPos !== null) {
          if (status === 'failed' && !generation.session.content()) {
            this.removeGeneratingBlock(editor, generation.blockId);
          } else {
            this.renderGeneratedMarkdown(editor, generation.session.content(), generation.blockId);
            this.finalizeGeneratingBlock(
              editor,
              generation.session.reasoning(),
              generation.blockId,
            );
          }
          this.activeGenerations.delete(generation.blockId);
        } else if (this.hasScene(editor, generation.sceneId)) {
          this.activeGenerations.delete(generation.blockId);
        }
        continue;
      }

      this.renderGeneratedMarkdown(editor, generation.session.content(), generation.blockId);
      this.updateReasoningText(editor, generation.blockAttrs, generation.session.reasoning());
    }
  }

  /**
   * Inserts a new aiGeneratedBlock after a prompt node and streams into it.
   * Called by AiPromptComponent when the user submits a prompt.
   */
  async generateNewBlock({
    editor,
    insertPos,
    aiPrompt,
    provider,
    modelId,
    reasoningMode,
    bookId,
    responseId,
    sourcePromptId,
    sceneId,
  }: GenerateNewBlockRequest): Promise<void> {
    const blockAttrs = this.createGeneratingBlockAttrs({
      id: responseId,
      sourcePromptId,
      promptText: aiPrompt.prompt,
      provider,
      modelId,
      reasoningMode,
    });

    this.insertInitialBlock(editor, insertPos, blockAttrs);

    await this.saver.flushDirtySections();
    await this.streamToBlock(
      blockAttrs,
      aiPrompt,
      provider,
      modelId,
      reasoningMode,
      bookId,
      sceneId,
    );
  }

  /**
   * Clears an existing aiGeneratedBlock and streams a fresh response into it.
   * Used by AiGeneratedBlockComponent for "Try Again" and "Modify".
   */
  async regenerateExistingBlock({
    editor,
    blockPos,
    currentAttrs,
    aiPrompt,
    provider,
    modelId,
    reasoningMode,
    bookId,
    promptText,
    sceneId,
  }: RegenerateExistingBlockRequest): Promise<void> {
    const blockAttrs = this.createGeneratingBlockAttrs({
      id: currentAttrs['id'],
      sourcePromptId: currentAttrs['sourcePromptId'],
      promptText,
      provider,
      modelId,
      reasoningMode,
      reasoningText: '',
    });

    this.markBlockAsGenerating(editor, blockPos, blockAttrs);

    if (this.resetBlockContent(editor, blockPos) === null) return;

    await this.saver.flushDirtySections();
    await this.streamToBlock(
      blockAttrs,
      aiPrompt,
      provider,
      modelId,
      reasoningMode,
      bookId,
      sceneId,
    );
  }

  /** Replaces the AI wrapper with its generated paragraphs. */
  applyBlock(editor: Editor, blockPos: number, nodeSize: number, content: any): void {
    editor.chain().focus().insertContentAt(
      { from: blockPos, to: blockPos + nodeSize },
      content.toJSON()
    ).run();
  }

  /** Removes the AI block and all generated content. */
  discardBlock(editor: Editor, blockPos: number, nodeSize: number): void {
    editor.commands.deleteRange({ from: blockPos, to: blockPos + nodeSize });
  }


  // ---------------------------------------------------------------------------
  // Block Creation / Reset
  // ---------------------------------------------------------------------------

  private createGeneratingBlockAttrs(attrs: GeneratedBlockAttrs): GeneratedBlockAttrs {
    return {
      ...attrs,
      isGenerating: true,
    };
  }

  private insertInitialBlock(
    editor: Editor,
    insertPos: number,
    blockAttrs: GeneratedBlockAttrs
  ): number {
    const blockNodeJson = {
      type: AI_GENERATED_BLOCK_NODE,
      attrs: blockAttrs,
      content: [{ type: PARAGRAPH_NODE }],
    };

    const node = editor.schema.nodeFromJSON(blockNodeJson);
    const tr = editor.state.tr.insert(insertPos, node);

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    // +2 lands inside the first paragraph nested in the block.
    return insertPos + 2;
  }

  private markBlockAsGenerating(
    editor: Editor,
    blockPos: number,
    currentAttrs: GeneratedBlockAttrs
  ): void {
    const tr = editor.state.tr.setNodeMarkup(blockPos, undefined, {
      ...currentAttrs,
      isGenerating: true,
      reasoningText: '',
    });

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  private resetBlockContent(editor: Editor, blockPos: number): number | null {
    const blockNode = editor.state.doc.nodeAt(blockPos);
    if (!blockNode) return null;

    const innerStart = blockPos + 1;
    const innerEnd = blockPos + blockNode.nodeSize - 1;
    const paragraphNode = editor.schema.nodes[PARAGRAPH_NODE].create();

    const tr = editor.state.tr.delete(innerStart, innerEnd);
    tr.insert(innerStart, paragraphNode);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    return innerStart + 1;
  }


  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  private async streamToBlock(
    blockAttrs: GeneratedBlockAttrs,
    aiPrompt: BuiltAiPrompt,
    provider: string,
    modelId: string | undefined,
    reasoningMode: boolean,
    bookId: string,
    sceneId: string,
  ): Promise<void> {
    const blockId = String(blockAttrs['id']);
    const sourcePromptId = String(blockAttrs['sourcePromptId'] ?? '');
    const loadingSignal = this.loadingState.get(blockId) ?? signal<LoadingStatus>('idle');
    const promptLoadingSignal = sourcePromptId
      ? this.ensurePromptLoadingState(sourcePromptId)
      : null;
    this.loadingState.set(blockId, loadingSignal);
    let animationFrame: number | null = null;
    let latestContent = '';

    const scheduleVisibleRender = (content: string): void => {
      latestContent = content;
      if (animationFrame !== null) return;

      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const editor = this.currentEditor;
        if (editor && !editor.isDestroyed) {
          this.renderGeneratedMarkdown(editor, latestContent, blockId);
        }
      });
    };

    const session = this.generationSessions.start({
      streamId: blockId,
      source: 'manuscript-prose',
      bookId,
      aiPrompt,
      provider,
      modelId,
      reasoningMode,
      onContentChange: scheduleVisibleRender,
      onReasoningChange: reasoningText => {
        const editor = this.currentEditor;
        if (editor && !editor.isDestroyed) {
          this.updateReasoningText(editor, blockAttrs, reasoningText);
        }
      },
      onStatusChange: status => {
        const loadingStatus = this.toLoadingStatus(status);
        loadingSignal.set(loadingStatus);
        promptLoadingSignal?.set(loadingStatus);
      },
    });

    if (!session) {
      const editor = this.currentEditor;
      if (editor && !editor.isDestroyed) this.removeGeneratingBlock(editor, blockId);
      return;
    }

    this.activeGenerations.set(blockId, { blockId, sceneId, blockAttrs, session });

    try {
      const result = await session.completion;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);

      await this.persistCompletedGeneration({
        sceneId,
        blockId,
        blockAttrs,
        content: result.content,
        reasoning: result.reasoning,
        removeBlock: result.status === 'failed' && !result.content,
      });

      if (result.status === 'failed') {
        console.error('AI Generation failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to finalize AI generation:', error);
      this.toastService.error(
        'The generated prose could not be saved.',
        'AI Generation',
      );
    } finally {
      loadingSignal.set('idle');
      promptLoadingSignal?.set('idle');
      if (!this.viewChangeInProgress) this.activeGenerations.delete(blockId);
      this.generationSessions.release(blockId);
    }
  }

  private isSessionActive(session: AiGenerationSession): boolean {
    const status = session.status();
    return status !== 'complete' && status !== 'stopped' && status !== 'failed';
  }

  private toLoadingStatus(status: string): LoadingStatus {
    return status === 'loading' || status === 'thinking' || status === 'generating'
      ? status
      : 'idle';
  }

  private async persistCompletedGeneration({
    sceneId,
    blockId,
    blockAttrs,
    content,
    reasoning,
    removeBlock,
  }: PersistCompletedGenerationRequest): Promise<void> {
    await this.saver.flushDirtySections();

    const proseBySceneId = await this.electronService.invoke(
      'manuscript:getScenesProse',
      { sceneIds: [sceneId] },
    ) as Record<string, TiptapJsonDoc | null>;
    const prose = proseBySceneId[sceneId] ?? { type: 'doc', content: [] };
    const replacementContent = this.parseGeneratedMarkdown(content);
    let foundBlock = false;
    const nextContent = (prose.content ?? []).flatMap(node => {
      if (node.type !== AI_GENERATED_BLOCK_NODE || node.attrs?.['id'] !== blockId) {
        return [node];
      }

      foundBlock = true;
      if (removeBlock) return [];

      return [{
        type: AI_GENERATED_BLOCK_NODE,
        attrs: {
          ...blockAttrs,
          isGenerating: false,
          reasoningText: reasoning,
        },
        content: replacementContent,
      } satisfies TiptapNode];
    });

    if (!foundBlock) {
      this.toastService.error(
        'The original AI response block could not be found.',
        'AI Generation',
      );
      const editor = this.currentEditor;
      if (editor && !editor.isDestroyed) this.removeGeneratingBlock(editor, blockId);
      return;
    }

    const nextProse: TiptapJsonDoc = { type: 'doc', content: nextContent };
    const wordCount = this.countWords(nextProse);
    await this.manuscriptStore.updateScene({ id: sceneId, prose: nextProse, wordCount });

    const editor = this.currentEditor;
    if (!editor || editor.isDestroyed) return;

    if (removeBlock) {
      this.removeGeneratingBlock(editor, blockId);
      return;
    }

    this.renderGeneratedMarkdown(editor, content, blockId);
    this.finalizeGeneratingBlock(editor, reasoning, blockId);
  }

  private parseGeneratedMarkdown(markdown: string): TiptapNode[] {
    if (!markdown) return [{ type: PARAGRAPH_NODE }];

    const parser = new Editor({ extensions: [StarterKit, Markdown] });
    try {
      const markdownManager = parser.markdown;
      if (!markdownManager) return [{ type: PARAGRAPH_NODE }];

      const parsedDocument = markdownManager.parse(markdown);
      const content = parsedDocument.content ?? [];
      return content.length > 0
        ? content as TiptapNode[]
        : [{ type: PARAGRAPH_NODE }];
    } finally {
      parser.destroy();
    }
  }

  private countWords(prose: TiptapJsonDoc): number {
    const text = (prose.content ?? []).map(extractTextFromJsonNode).join(' ');
    return text.trim().split(/\s+/).filter(Boolean).length;
  }


  // ---------------------------------------------------------------------------
  // Block Finalization
  // ---------------------------------------------------------------------------

  /** Converts completed AI Markdown into regular Tiptap content inside its review block. */
  private renderGeneratedMarkdown(editor: Editor, markdown: string, blockId: string): void {
    if (!markdown) return;

    const blockPos = this.findGeneratingBlockPos(editor, blockId);
    if (blockPos === null || !editor.markdown) return;

    const blockNode = editor.state.doc.nodeAt(blockPos);
    if (!blockNode) return;

    try {
      const parsedDocument = editor.markdown.parse(markdown);
      const content = parsedDocument.content;

      if (!content || content.length === 0) return;

      const renderedBlock = editor.schema.nodeFromJSON({
        type: AI_GENERATED_BLOCK_NODE,
        attrs: blockNode.attrs,
        content,
      });
      const tr = editor.state.tr.replaceWith(
        blockPos,
        blockPos + blockNode.nodeSize,
        renderedBlock,
      );

      tr.setMeta('addToHistory', false);
      editor.view.dispatch(tr);
    } catch (error) {
      console.warn('Failed to render generated Markdown:', error);
    }
  }

  private updateReasoningText(
    editor: Editor,
    blockAttrs: GeneratedBlockAttrs,
    reasoningText: string
  ): void {
    const resolvedPos = this.findGeneratingBlockPos(editor, blockAttrs['id']);
    if (resolvedPos === null) return;

    const tr = editor.state.tr.setNodeMarkup(resolvedPos, undefined, {
      ...blockAttrs,
      reasoningText,
    });

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  private removeGeneratingBlock(editor: Editor, blockId: string): void {
    const foundPos = this.findGeneratingBlockPos(editor, blockId);
    if (foundPos === null) return;

    const foundNode = editor.state.doc.nodeAt(foundPos);
    if (!foundNode) return;

    const tr = editor.state.tr.delete(foundPos, foundPos + foundNode.nodeSize);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  private finalizeGeneratingBlock(editor: Editor, reasoningText: string, blockId: string): void {
    const foundPos = this.findGeneratingBlockPos(editor, blockId);
    if (foundPos === null) return;

    const foundNode = editor.state.doc.nodeAt(foundPos);
    if (!foundNode) return;

    const finalizedBlockJson = {
      type: AI_GENERATED_BLOCK_NODE,
      attrs: {
        id: foundNode.attrs['id'],
        sourcePromptId: foundNode.attrs['sourcePromptId'] || '',
        promptText: foundNode.attrs['promptText'] || '',
        provider: foundNode.attrs['provider'] || '',
        modelId: foundNode.attrs['modelId'] || '',
        isGenerating: false,
        reasoningText,
        reasoningMode: foundNode.attrs['reasoningMode'] || false,
      },
      content: foundNode.content.toJSON(),
    };

    const blockNodeSize = foundNode.nodeSize;
    const tr = editor.state.tr.delete(foundPos, foundPos + blockNodeSize);

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    // The finalized insertion is intentionally added to history so the user can
    // undo the generated result as one document change.
    editor.chain().insertContentAt(foundPos, finalizedBlockJson).focus().run();
  }

  /**
   * Re-resolves the generating block because streamed insertions can shift the
   * original position captured when generation started.
   */
  private findGeneratingBlockPos(editor: Editor, blockId: string): number | null {
    let blockPos: number | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (
        node.type.name === AI_GENERATED_BLOCK_NODE
        && node.attrs['id'] === blockId
        && node.attrs['isGenerating']
      ) {
        blockPos = pos;
        return false;
      }

      return true;
    });

    return blockPos;
  }

  private hasScene(editor: Editor, sceneId: string): boolean {
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'sceneSummary' && node.attrs['id'] === sceneId) {
        found = true;
        return false;
      }
      return true;
    });
    return found;
  }

}
