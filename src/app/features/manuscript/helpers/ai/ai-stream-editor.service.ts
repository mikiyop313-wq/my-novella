import { Injectable, WritableSignal, inject } from '@angular/core';
import { Editor } from '@tiptap/core';
import { AIStateService } from '../../../../core/services/ai-state.service';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';

@Injectable({ providedIn: 'root' })
export class AiStreamEditorService {
  private aiStateService = inject(AIStateService);
  private saver = inject(ManuscriptProseSaverService);

  public loadingState = new Map<string, WritableSignal<'idle' | 'loading' | 'thinking' | 'generating'>>();

  /** Tracks which blocks have been explicitly stopped by the user. */
  private stoppedBlocks = new Set<string>();

  /**
   * Aborts the current AI generation for the given block.
   * The network request is cancelled on the main process side; any partial
   * content already written to the editor will be preserved and finalized.
   */
  async stopGeneration(blockId: string): Promise<void> {
    this.stoppedBlocks.add(blockId);
    await this.aiStateService.abort();
  }
  /**
   * Inserts a new `aiGeneratedBlock` after the given position and streams AI content into it.
   * Used by AiPromptComponent when the user submits a prompt.
   */
  async generateNewBlock(
    editor: Editor,
    insertPos: number,
    promptText: string,
    provider: string,
    modelId: string,
    reasoningMode: boolean,
    blockId?: string
  ): Promise<void> {
    // Sync any pending paragraph changes to the vector DB before generation
    // so the AI retrieval context reflects the latest manuscript state.
    await this.saver.flushParagraphVectorChanges();

    // Create an initial empty paragraph wrapped in aiGeneratedBlock
    const blockAttrs = {
      id: blockId || crypto.randomUUID(),
      promptText,
      provider,
      modelId,
      isGenerating: true,
      reasoningMode
    };

    const blockNodeJson = {
      type: 'aiGeneratedBlock',
      attrs: blockAttrs,
      content: [{ type: 'paragraph' }]
    };

    const tr = editor.state.tr;
    const node = editor.schema.nodeFromJSON(blockNodeJson);
    tr.insert(insertPos, node);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);

    // +2 to move the cursor inside the newly created paragraph node within the block
    const startInsertPos = insertPos + 2;

    await this.streamToBlock(editor, insertPos, startInsertPos, blockAttrs, promptText, provider, modelId, reasoningMode);
  }

  /**
   * Clears an existing `aiGeneratedBlock` and streams a new AI response into it.
   * Used by AiGeneratedBlockComponent for "Try Again" and "Modify".
   */
  async regenerateExistingBlock(
    editor: Editor,
    blockPos: number,
    currentAttrs: Record<string, any>,
    newPrompt: string,
    provider: string,
    modelId: string,
    reasoningMode: boolean
  ): Promise<void> {
    // Update attribute isGenerating to true (without adding to history)
    const tr1 = editor.state.tr.setNodeMarkup(blockPos, undefined, {
      ...currentAttrs,
      isGenerating: true,
      reasoningText: ''
    });
    tr1.setMeta('addToHistory', false);
    editor.view.dispatch(tr1);

    // Re-resolve node after the attribute change
    const blockNode = editor.state.doc.nodeAt(blockPos);
    if (!blockNode) return;

    // Clear current content inside the block (without adding to history)
    const innerStart = blockPos + 1;
    const innerEnd = blockPos + blockNode.nodeSize - 1;

    const tr2 = editor.state.tr.delete(innerStart, innerEnd);
    const pNode = editor.schema.nodes['paragraph'].create();
    tr2.insert(innerStart, pNode);
    tr2.setMeta('addToHistory', false);
    editor.view.dispatch(tr2);

    const startInsertPos = innerStart + 1;
    const blockAttrs = {
      id: currentAttrs['id'],
      promptText: currentAttrs['promptText'] || '',
      provider,
      modelId,
      isGenerating: true,
      reasoningMode,
      reasoningText: ''
    };

    await this.streamToBlock(editor, blockPos, startInsertPos, blockAttrs, newPrompt, provider, modelId, reasoningMode);
  }

  /**
   * Replaces the aiGeneratedBlock wrapper with its raw generated paragraphs,
   * effectively "applying" the AI text into the document.
   */
  applyBlock(editor: Editor, blockPos: number, nodeSize: number, content: any): void {
    editor.chain().focus().insertContentAt(
      { from: blockPos, to: blockPos + nodeSize },
      content.toJSON()
    ).run();
  }

  /**
   * Deletes the aiGeneratedBlock and all its contents completely.
   */
  discardBlock(editor: Editor, blockPos: number, nodeSize: number): void {
    editor.commands.deleteRange({ from: blockPos, to: blockPos + nodeSize });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Shared streaming logic: parses the AI response character-by-character,
   * splits paragraphs on newlines, throttles reasoning attribute updates,
   * and finalizes or cleans up the block in a `finally` block.
   */
  private async streamToBlock(
    editor: Editor,
    blockPos: number,
    startInsertPos: number,
    blockAttrs: Record<string, any>,
    promptText: string,
    provider: string,
    modelId: string | undefined,
    reasoningMode: boolean
  ): Promise<void> {
    let currentInsertPos = startInsertPos;

    const queue: string[] = [];
    let isAnimating = false;
    let streamFinished = false;
    let resolveDrain: () => void;
    const drainPromise = new Promise<void>(res => resolveDrain = res);

    // Flag to track consecutive newlines so we only create one paragraph break for multiple \n\n
    let isNewlineSequence = false;

    const processQueue = () => {
      if (queue.length === 0) {
        if (streamFinished) {
          isAnimating = false;
          resolveDrain();
        } else {
          isAnimating = false;
        }
        return;
      }

      // To ensure fluid animation without falling behind:
      // Process at least 2 characters per frame, or 20% of the queue if it's large.
      const charsToProcess = Math.max(2, Math.ceil(queue.length / 5));

      let textToInsert = '';
      let isNewline = false;

      for (let i = 0; i < charsToProcess; i++) {
        if (queue.length === 0) break;

        if (queue[0] === '\n') {
          if (textToInsert.length > 0) {
            break; // Insert text first, handle newline next frame
          } else {
            isNewline = true;
            queue.shift(); // Consume newline
            break; // Handle one split per frame
          }
        } else {
          textToInsert += queue.shift();
        }
      }

      if (textToInsert.length > 0) {
        hasWrittenContent = true;
        const beforeSize = editor.state.doc.content.size;
        const trInsert = editor.state.tr.insertText(textToInsert, currentInsertPos);
        trInsert.setMeta('addToHistory', false);
        editor.view.dispatch(trInsert);
        currentInsertPos += (editor.state.doc.content.size - beforeSize);
      } else if (isNewline) {
        const beforeSize = editor.state.doc.content.size;
        const trSplit = editor.state.tr.split(currentInsertPos);
        trSplit.setMeta('addToHistory', false);
        editor.view.dispatch(trSplit);
        currentInsertPos += (editor.state.doc.content.size - beforeSize);
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

    let hasError = false;
    let hasWrittenContent = false;
    let reasoningBuffer = '';
    let lastReasoningUpdate = Date.now();

    try {
      // Start streaming the AI response
      await this.aiStateService.generate(promptText, provider, modelId, (token) => {
        if (token) {
          const loadingSig = this.loadingState.get(blockAttrs['id']);
          if (loadingSig && loadingSig() !== 'generating') {
            loadingSig.set('generating');
          }

          for (let i = 0; i < token.length; i++) {
            const char = token[i];
            if (char === '\n' || char === '\r') {
              if (char === '\n') {
                if (!isNewlineSequence) {
                  enqueue('\n');
                  isNewlineSequence = true;
                }
              }
            } else {
              isNewlineSequence = false;
              enqueue(char);
            }
          }
        }
      }, reasoningMode, (reasoningToken) => {
        if (reasoningToken) {
          const loadingSig = this.loadingState.get(blockAttrs['id']);
          if (loadingSig && loadingSig() !== 'thinking') {
            loadingSig.set('thinking');
          }

          reasoningBuffer += reasoningToken;
          const now = Date.now();

          // Throttle attribute updates to once every 200ms.
          // Reasoning text is stored as a node attribute. Updating node attributes forces Angular
          // and Tiptap to re-render the block UI with the entire new string. Throttling this
          // prevents the UI from freezing when reasoning tokens stream very quickly.
          if (now - lastReasoningUpdate > 200) {
            // Re-resolve the block position by scanning the doc — the position may have shifted
            // due to content insertions.
            const resolvedPos = this.findGeneratingBlockPos(editor);
            if (resolvedPos !== null) {
              const trUpdate = editor.state.tr.setNodeMarkup(resolvedPos, undefined, {
                ...blockAttrs,
                reasoningText: reasoningBuffer
              });
              trUpdate.setMeta('addToHistory', false);
              editor.view.dispatch(trUpdate);
              lastReasoningUpdate = now;
            }
          }
        }
      });
    } catch (err) {
      hasError = true;
      console.error('AI Generation failed:', err);
    } finally {
      streamFinished = true;

      // Drain the animation queue if there is content worth keeping:
      // either a clean stream finish, or an error that happened after some text was already written.
      if (!hasError || hasWrittenContent) {
        if (!isAnimating) {
          isAnimating = true;
          processQueue();
        }
        await drainPromise;
      }

      if (hasError && !hasWrittenContent) {
        // Nothing was written — remove the empty placeholder block silently
        const foundPos = this.findGeneratingBlockPos(editor);
        if (foundPos !== null) {
          const foundNode = editor.state.doc.nodeAt(foundPos);
          if (foundNode) {
            const trDel = editor.state.tr.delete(foundPos, foundPos + foundNode.nodeSize);
            trDel.setMeta('addToHistory', false);
            editor.view.dispatch(trDel);
          }
        }
      } else {
        // Finalize the block: toggle isGenerating to false and persist reasoning
        const foundPos = this.findGeneratingBlockPos(editor);
        if (foundPos !== null) {
          const foundNode = editor.state.doc.nodeAt(foundPos);
          if (foundNode) {
            const finalizedBlockJson = {
              type: 'aiGeneratedBlock',
              attrs: {
                id: foundNode.attrs['id'],
                promptText: foundNode.attrs['promptText'] || '',
                provider: foundNode.attrs['provider'] || '',
                modelId: foundNode.attrs['modelId'] || '',
                isGenerating: false,
                reasoningText: reasoningBuffer,
                reasoningMode: foundNode.attrs['reasoningMode'] || false
              },
              content: foundNode.content.toJSON()
            };

            const blockNodeSize: number = foundNode.nodeSize;

            // Delete the temporary block (without adding to history)
            const trDel = editor.state.tr.delete(foundPos, foundPos + blockNodeSize);
            trDel.setMeta('addToHistory', false);
            editor.view.dispatch(trDel);

            // Insert finalized block (with adding to history)
            editor.chain().insertContentAt(foundPos, finalizedBlockJson).focus().run();
          }
        }
        // Clear stopped flag for this block after finalization
        this.stoppedBlocks.delete(blockAttrs['id']);
      }
    }
  }

  /**
   * Scans the document to find the position of an aiGeneratedBlock that is
   * currently generating (isGenerating === true).
   */
  private findGeneratingBlockPos(editor: Editor): number | null {
    let blockPos: number | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'aiGeneratedBlock' && node.attrs['isGenerating']) {
        blockPos = pos;
        return false;
      }
      return true;
    });

    return blockPos;
  }
}
