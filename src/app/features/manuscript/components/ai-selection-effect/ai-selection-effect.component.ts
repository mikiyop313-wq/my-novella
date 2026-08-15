import { Component, computed, effect, inject, NgZone, signal } from '@angular/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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
  private readonly zone = inject(NgZone);
  private selection: { from: number; to: number } | null = null;
  private editor: Editor | null = null;
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      const currentEditor = this.store.editor();
      if (!currentEditor) return;

      currentEditor.on('selectionUpdate', this.onSelectionUpdate);
      currentEditor.on('update', this.onEditorUpdate);
      window.addEventListener('resize', this.onSelectionUpdate);
      window.addEventListener('scroll', this.onSelectionUpdate, true);

      onCleanup(() => {
        currentEditor.off('selectionUpdate', this.onSelectionUpdate);
        currentEditor.off('update', this.onEditorUpdate);
        window.removeEventListener('resize', this.onSelectionUpdate);
        window.removeEventListener('scroll', this.onSelectionUpdate, true);
        this.dismiss();
      });
    });
  }

  start(): boolean {
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
    this.addSelectionSpacing(currentEditor, this.selection, false, true);
    if (!this.updatePosition(currentEditor)) {
      this.removeSelectionSpacing();
      this.selection = null;
      this.editor = null;
      return false;
    }

    window.getSelection()?.removeAllRanges();
    this.state.set('drawing');
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

  cancel(): void {
    this.dismiss();
  }

  confirm(): void {
    this.dismiss();
  }

  private readonly onSelectionUpdate = () => {
    this.zone.run(() => {
      if (this.state() === 'idle') return;
      if (!this.hasOriginalSelection()) {
        this.dismiss();
        return;
      }
      this.updatePosition();
    });
  };

  private readonly onEditorUpdate = () => {
    this.zone.run(() => {
      if (this.state() !== 'idle') this.dismiss();
    });
  };

  private dismiss(): void {
    this.clearTimers();
    this.removeSelectionSpacing();
    this.selection = null;
    this.editor = null;
    this.bounds.set(null);
    this.state.set('idle');
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
