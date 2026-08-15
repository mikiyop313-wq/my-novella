import { Injectable, WritableSignal, inject } from '@angular/core';
import { Editor } from '@tiptap/core';

import { AiStreamService, LoadingStatus } from '../../../../core/services/ai-stream.service';
import type { AiChatMessage } from '../../../../core/services/ai-state.service';

type GeneratedBlockAttrs = Record<string, any>;

const AI_GENERATED_BLOCK_NODE = 'aiGeneratedBlock';
const PARAGRAPH_NODE = 'paragraph';

@Injectable({ providedIn: 'root' })
export class AiStreamEditorService {

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly aiStreamService = inject(AiStreamService);


  // ---------------------------------------------------------------------------
  // Shared Stream State
  // ---------------------------------------------------------------------------

  public readonly loadingState: Map<string, WritableSignal<LoadingStatus>> = this.aiStreamService.loadingState;

  /** Tracks blocks whose in-flight network request was explicitly aborted. */
  private readonly stoppedBlocks = new Set<string>();


  // ---------------------------------------------------------------------------
  // Public Generation API
  // ---------------------------------------------------------------------------

  /**
   * Aborts the current AI generation for the given block.
   * Partial text already inserted into the editor is preserved and finalized.
   */
  async stopGeneration(blockId: string): Promise<void> {
    this.stoppedBlocks.add(blockId);
    await this.aiStreamService.stopStream(blockId);
  }

  /**
   * Inserts a new aiGeneratedBlock after a prompt node and streams into it.
   * Called by AiPromptComponent when the user submits a prompt.
   */
  async generateNewBlock(
    editor: Editor,
    insertPos: number,
    promptText: string,
    provider: string,
    modelId: string,
    reasoningMode: boolean,
    blockId?: string,
    messages?: AiChatMessage[],
  ): Promise<void> {
    const blockAttrs = this.createGeneratingBlockAttrs({
      id: blockId || crypto.randomUUID(),
      promptText,
      provider,
      modelId,
      reasoningMode,
    });

    const startInsertPos = this.insertInitialBlock(editor, insertPos, blockAttrs);

    await this.streamToBlock(
      editor,
      startInsertPos,
      blockAttrs,
      promptText,
      provider,
      modelId,
      reasoningMode,
      messages,
    );
  }

  /**
   * Clears an existing aiGeneratedBlock and streams a fresh response into it.
   * Used by AiGeneratedBlockComponent for "Try Again" and "Modify".
   */
  async regenerateExistingBlock(
    editor: Editor,
    blockPos: number,
    currentAttrs: GeneratedBlockAttrs,
    newPrompt: string,
    provider: string,
    modelId: string,
    reasoningMode: boolean
  ): Promise<void> {
    const blockAttrs = this.createGeneratingBlockAttrs({
      id: currentAttrs['id'],
      promptText: currentAttrs['promptText'] || '',
      provider,
      modelId,
      reasoningMode,
      reasoningText: '',
    });

    this.markBlockAsGenerating(editor, blockPos, currentAttrs);

    const startInsertPos = this.resetBlockContent(editor, blockPos);
    if (startInsertPos === null) return;

    await this.streamToBlock(
      editor,
      startInsertPos,
      blockAttrs,
      newPrompt,
      provider,
      modelId,
      reasoningMode
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

  /**
   * Streams generated text into the editor a few characters per animation
   * frame. Reasoning tokens are stored as node attrs and throttled because each
   * attr write re-renders the Angular NodeView.
   */
  private async streamToBlock(
    editor: Editor,
    startInsertPos: number,
    blockAttrs: GeneratedBlockAttrs,
    promptText: string,
    provider: string,
    modelId: string | undefined,
    reasoningMode: boolean,
    messages?: AiChatMessage[],
  ): Promise<void> {
    let currentInsertPos = startInsertPos;
    let hasError = false;
    let hasWrittenContent = false;
    let reasoningBuffer = '';
    let markdownSource = '';

    const queue: string[] = [];
    let isAnimating = false;
    let streamFinished = false;
    let resolveDrain!: () => void;
    const drainPromise = new Promise<void>(resolve => resolveDrain = resolve);

    const processQueue = () => {
      if (queue.length === 0) {
        isAnimating = false;
        if (streamFinished) resolveDrain();
        return;
      }

      const nextChunk = this.takeNextTextChunk(queue);

      if (nextChunk.text.length > 0) {
        hasWrittenContent = true;
        currentInsertPos = this.insertText(editor, currentInsertPos, nextChunk.text);
      } else if (nextChunk.isNewline) {
        currentInsertPos = this.splitParagraph(editor, currentInsertPos);
      }

      requestAnimationFrame(processQueue);
    };

    const enqueue = (char: string) => {
      queue.push(char);

      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(processQueue);
      }
    };

    try {
      await this.aiStreamService.streamText({
        streamId: blockAttrs['id'],
        prompt: promptText,
        provider,
        modelId,
        reasoningMode,
        messages,
        onToken: token => {
          if (!token) return;

          markdownSource += token;

          if (token === '\n') {
            enqueue('\n');
          } else {
            enqueue(token);
          }
        },
        onReasoningUpdate: reasoningText => {
          reasoningBuffer = reasoningText;
          this.updateReasoningText(editor, blockAttrs, reasoningText);
        }
      });
    } catch (error) {
      hasError = true;
      console.error('AI Generation failed:', error);
    } finally {
      streamFinished = true;

      if (!hasError || hasWrittenContent) {
        if (!isAnimating) {
          isAnimating = true;
          processQueue();
        }

        await drainPromise;
      }

      if (hasError && !hasWrittenContent) {
        this.removeGeneratingBlock(editor);
      } else {
        this.renderGeneratedMarkdown(editor, markdownSource);
        this.finalizeGeneratingBlock(editor, reasoningBuffer);
        this.stoppedBlocks.delete(blockAttrs['id']);
      }
    }
  }

  private takeNextTextChunk(queue: string[]): { text: string; isNewline: boolean } {
    const charsToProcess = Math.max(2, Math.ceil(queue.length / 5));
    let text = '';

    for (let i = 0; i < charsToProcess; i++) {
      if (queue.length === 0) break;

      if (queue[0] === '\n') {
        if (text.length > 0) break;

        queue.shift();
        return { text: '', isNewline: true };
      }

      text += queue.shift();
    }

    return { text, isNewline: false };
  }

  private insertText(editor: Editor, insertPos: number, text: string): number {
    const beforeSize = editor.state.doc.content.size;
    const tr = editor.state.tr.insertText(text, insertPos);

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    return insertPos + (editor.state.doc.content.size - beforeSize);
  }

  private splitParagraph(editor: Editor, insertPos: number): number {
    const beforeSize = editor.state.doc.content.size;
    const tr = editor.state.tr.split(insertPos);

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    return insertPos + (editor.state.doc.content.size - beforeSize);
  }


  // ---------------------------------------------------------------------------
  // Block Finalization
  // ---------------------------------------------------------------------------

  /** Converts completed AI Markdown into regular Tiptap content inside its review block. */
  private renderGeneratedMarkdown(editor: Editor, markdown: string): void {
    if (!markdown) return;

    const blockPos = this.findGeneratingBlockPos(editor);
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
    const resolvedPos = this.findGeneratingBlockPos(editor);
    if (resolvedPos === null) return;

    const tr = editor.state.tr.setNodeMarkup(resolvedPos, undefined, {
      ...blockAttrs,
      reasoningText,
    });

    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  private removeGeneratingBlock(editor: Editor): void {
    const foundPos = this.findGeneratingBlockPos(editor);
    if (foundPos === null) return;

    const foundNode = editor.state.doc.nodeAt(foundPos);
    if (!foundNode) return;

    const tr = editor.state.tr.delete(foundPos, foundPos + foundNode.nodeSize);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }

  private finalizeGeneratingBlock(editor: Editor, reasoningText: string): void {
    const foundPos = this.findGeneratingBlockPos(editor);
    if (foundPos === null) return;

    const foundNode = editor.state.doc.nodeAt(foundPos);
    if (!foundNode) return;

    const finalizedBlockJson = {
      type: AI_GENERATED_BLOCK_NODE,
      attrs: {
        id: foundNode.attrs['id'],
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
  private findGeneratingBlockPos(editor: Editor): number | null {
    let blockPos: number | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === AI_GENERATED_BLOCK_NODE && node.attrs['isGenerating']) {
        blockPos = pos;
        return false;
      }

      return true;
    });

    return blockPos;
  }

}
