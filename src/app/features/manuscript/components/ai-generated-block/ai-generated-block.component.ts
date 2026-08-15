import { Component, signal, inject, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { AIStateService } from '../../../../core/services/ai-state.service';
import { TextSelection } from 'prosemirror-state';

@Component({
  selector: 'app-ai-generated-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-generated-block.component.html',
  styleUrl: './ai-generated-block.component.scss'
})
export class AiGeneratedBlockComponent extends AngularNodeViewComponent {
  private aiStateService = inject(AIStateService);

  @ViewChild('contentDOM') contentDOM!: ElementRef;

  isModifying = signal(false);
  modifyPrompt = signal('');

  promptText = computed(() => this.node().attrs['promptText'] || '');
  provider = computed(() => this.node().attrs['provider'] || '');
  modelId = computed(() => this.node().attrs['modelId'] || '');
  isGenerating = computed(() => this.node().attrs['isGenerating'] || false);

  applyText() {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    const nodeSize = this.node().nodeSize;
    const content = this.node().content;

    // Replace this aiGeneratedBlock with its children (the generated paragraphs)
    this.editor().chain().focus().insertContentAt({ from: pos, to: pos + nodeSize }, content.toJSON()).run();
  }

  discardText() {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    this.editor().commands.deleteRange({ from: pos, to: pos + this.node().nodeSize });
  }

  tryAgain() {
    if (this.isGenerating()) return;
    this.generateNewText(this.promptText());
  }

  toggleModify() {
    this.isModifying.set(!this.isModifying());
    if (!this.isModifying()) {
      this.modifyPrompt.set('');
    }
  }

  async submitModify() {
    if (!this.modifyPrompt().trim() || this.isGenerating()) return;

    const originalText = this.node().textContent;
    const combinedPrompt = `Original request: ${this.promptText()}\n\nGenerated text:\n${originalText}\n\nUser request to change:\n${this.modifyPrompt()}`;

    this.isModifying.set(false);
    this.modifyPrompt.set('');
    await this.generateNewText(combinedPrompt);
  }

  private async generateNewText(prompt: string) {
    if (typeof this.getPos !== 'function') return;

    const pos = this.getPos()();
    if (pos == null) return;

    // Update attribute isGenerating to true (without adding to history)
    const tr1 = this.editor().state.tr.setNodeMarkup(pos, undefined, {
      ...this.node().attrs,
      isGenerating: true
    });
    tr1.setMeta('addToHistory', false);
    this.editor().view.dispatch(tr1);

    // Clear current content inside the block (without adding to history)
    const innerStart = pos + 1;
    const innerEnd = pos + this.node().nodeSize - 1;

    const tr2 = this.editor().state.tr.delete(innerStart, innerEnd);
    const pNode = this.editor().schema.nodes['paragraph'].create();
    tr2.insert(innerStart, pNode);
    tr2.setMeta('addToHistory', false);
    this.editor().view.dispatch(tr2);

    let currentInsertPos = innerStart + 1;
    let textBuffer = '';
    let isNewlineSequence = false;

    const flushBuffer = () => {
      if (textBuffer.length > 0) {
        const beforeSize = this.editor().state.doc.content.size;
        const trInsert = this.editor().state.tr.insertText(textBuffer, currentInsertPos);
        trInsert.setMeta('addToHistory', false);
        this.editor().view.dispatch(trInsert);
        const afterSize = this.editor().state.doc.content.size;
        currentInsertPos += (afterSize - beforeSize);
        textBuffer = '';
      }
    };

    let hasError = false;
    try {
      await this.aiStateService.generate(prompt, this.provider(), this.modelId(), (token) => {
        if (token) {
          for (let i = 0; i < token.length; i++) {
            const char = token[i];
            if (char === '\n' || char === '\r') {
              if (char === '\n') {
                if (!isNewlineSequence) {
                  flushBuffer();
                  const beforeSize = this.editor().state.doc.content.size;
                  const trSplit = this.editor().state.tr.split(currentInsertPos);
                  trSplit.setMeta('addToHistory', false);
                  this.editor().view.dispatch(trSplit);
                  const afterSize = this.editor().state.doc.content.size;
                  currentInsertPos += (afterSize - beforeSize);
                  isNewlineSequence = true;
                }
              }
            } else {
              isNewlineSequence = false;
              textBuffer += char;
            }
          }
          flushBuffer();
        }
      });
    } catch (err) {
      hasError = true;
      console.error('AI Generation failed in block:', err);
    } finally {
      flushBuffer();
      if (hasError) {
        const state = this.editor().state;
        let blockPos: number | null = null;
        let blockSize: number | null = null;

        state.doc.descendants((node, p) => {
          if (node.type.name === 'aiGeneratedBlock' && node.attrs['isGenerating']) {
            blockPos = p;
            blockSize = node.nodeSize;
            return false;
          }
          return true;
        });

        if (blockPos !== null && blockSize !== null) {
          const trDel = this.editor().state.tr.delete(blockPos, blockPos + blockSize);
          trDel.setMeta('addToHistory', false);
          this.editor().view.dispatch(trDel);
        }
      } else {
        // Find the block and finalize it
        const state = this.editor().state;
        let blockPos: number | null = null;
        let blockNode: any = null;

        state.doc.descendants((node, p) => {
          if (node.type.name === 'aiGeneratedBlock' && node.attrs['isGenerating']) {
            blockPos = p;
            blockNode = node;
            return false;
          }
          return true;
        });

        if (blockPos !== null && blockNode !== null) {
          const finalizedBlockJson = {
            type: 'aiGeneratedBlock',
            attrs: {
              promptText: blockNode.attrs['promptText'] || '',
              provider: blockNode.attrs['provider'] || '',
              modelId: blockNode.attrs['modelId'] || '',
              isGenerating: false
            },
            content: blockNode.content.toJSON()
          };

          const blockNodeSize: number = blockNode.nodeSize;

          // Delete the temporary block (without adding to history)
          const trDel = this.editor().state.tr.delete(blockPos, blockPos + blockNodeSize);
          trDel.setMeta('addToHistory', false);
          this.editor().view.dispatch(trDel);

          // Insert finalized block (with adding to history)
          this.editor().chain().insertContentAt(blockPos, finalizedBlockJson).focus().run();
        }
      }
    }
  }
}
