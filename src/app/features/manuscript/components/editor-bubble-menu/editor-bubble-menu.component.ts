import { Component, ElementRef, ViewChild, signal, inject, NgZone, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';
import { ManuscriptStore } from '../../store/manuscript.store';
import { AiGenerationSessionService } from '../../../../core/services/ai-generation-session.service';
import {
  AiSelectionEffectComponent,
  type AiSelectionEditRequest,
} from '../ai-selection-effect/ai-selection-effect.component';

@Component({
  selector: 'app-editor-bubble-menu',
  standalone: true,
  imports: [CommonModule, OverlayMenuDirective, AiSelectionEffectComponent],
  templateUrl: './editor-bubble-menu.component.html',
  styleUrl: './editor-bubble-menu.component.scss'
})
export class EditorBubbleMenuComponent {
  @ViewChild('menuRef') menuRef!: ElementRef<HTMLDivElement>;
  @ViewChild(AiSelectionEffectComponent) aiSelectionEffect!: AiSelectionEffectComponent;

  readonly store = inject(ManuscriptStore);
  readonly generationSessions = inject(AiGenerationSessionService);
  private zone = inject(NgZone);

  // Responsive signals for UI
  isVisible = signal(false);
  isBelow = signal(false);
  top = signal(0);
  left = signal(0);
  wordCount = signal(0);
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect((onCleanup) => {
      const currentEditor = this.store.editor();
      if (currentEditor) {
        // Register Tiptap event listeners
        currentEditor.on('selectionUpdate', this.onSelectionUpdate);
        currentEditor.on('focus', this.onSelectionUpdate);
        currentEditor.on('blur', this.onBlur);

        // Listen to window resize and scroll events (capturing to detect scrolling in containers)
        window.addEventListener('resize', this.onSelectionUpdate);
        window.addEventListener('scroll', this.onSelectionUpdate, true);

        onCleanup(() => {
          currentEditor.off('selectionUpdate', this.onSelectionUpdate);
          currentEditor.off('focus', this.onSelectionUpdate);
          currentEditor.off('blur', this.onBlur);

          window.removeEventListener('resize', this.onSelectionUpdate);
          window.removeEventListener('scroll', this.onSelectionUpdate, true);
          this.clearBlurTimer();
        });
      }
    });
  }

  private onSelectionUpdate = () => {
    this.zone.run(() => {
      this.updateMenuPosition();
    });
  };

  private onBlur = () => {
    // Delay hiding slightly to allow clicks on formatting buttons inside the menu
    this.clearBlurTimer();
    this.blurTimer = setTimeout(() => {
      this.zone.run(() => {
        this.blurTimer = null;
        const activeEl = document.activeElement;
        if (this.menuRef?.nativeElement && activeEl && this.menuRef.nativeElement.contains(activeEl)) {
          return;
        }
        this.isVisible.set(false);
      });
    }, 150);
  };

  private updateMenuPosition(): void {
    if (this.aiSelectionEffect?.state() !== 'idle') {
      this.isVisible.set(false);
      return;
    }

    const currentEditor = this.store.editor();
    if (!currentEditor) {
      this.isVisible.set(false);
      return;
    }

    const { state } = currentEditor;
    const { selection } = state;

    // Check if there is a text selection
    if (!selection || selection.empty || selection.from === selection.to) {
      this.isVisible.set(false);
      return;
    }

    // Check if selection intersects with or is inside an AI generated block
    let isInsideAiGeneratedBlock = false;
    state.doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.type.name === 'aiGeneratedBlock') {
        isInsideAiGeneratedBlock = true;
        return; // Stop traversing once found
      }
    });

    if (isInsideAiGeneratedBlock) {
      this.isVisible.set(false);
      return;
    }

    // Get selected text to calculate word count
    const text = state.doc.textBetween(selection.from, selection.to, ' ');
    if (!text.trim()) {
      this.isVisible.set(false);
      return;
    }

    // Calculate word count
    const count = text.trim().split(/\s+/).filter(Boolean).length;
    this.wordCount.set(count);

    // Get coordinates using DOM Selection
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      this.isVisible.set(false);
      return;
    }

    try {
      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        this.isVisible.set(false);
        return;
      }

      // Check if there is enough space above the selection
      const menuHeight = 80; // Approximate menu height
      if (rect.top < menuHeight) {
        // Position below the selection
        this.top.set(rect.bottom + 10);
        this.isBelow.set(true);
      } else {
        // Position above the selection
        this.top.set(rect.top - 10);
        this.isBelow.set(false);
      }

      // Align to the left of the selection
      this.left.set(rect.left);
      this.isVisible.set(true);
    } catch (e) {
      console.error('Failed to locate selection coordinates:', e);
      this.isVisible.set(false);
    }
  }

  rephrase(): boolean {
    return this.startAiEdit({
      category: 'rephrase',
      instruction: 'Rephrase the marked passage.',
      actionLabel: 'Rephrase',
    });
  }

  shorten(): boolean {
    return this.startAiEdit({
      category: 'shorten',
      instruction: 'Shorten the marked passage.',
      actionLabel: 'Shorten',
    });
  }

  expand(): boolean {
    return this.startAiEdit({
      category: 'expand',
      instruction: 'Expand the marked passage.',
      actionLabel: 'Expand',
    });
  }

  other(prompt: string): boolean {
    const instruction = prompt.trim();
    if (!instruction) return false;

    return this.startAiEdit({
      category: 'rephrase',
      instruction,
      actionLabel: 'Other',
    });
  }

  private startAiEdit(request: AiSelectionEditRequest): boolean {
    if (this.generationSessions.hasActiveSession('manuscript-selection')) return false;

    const started = this.aiSelectionEffect.startEdit(request);
    if (started) this.isVisible.set(false);
    return started;
  }

  private clearBlurTimer(): void {
    if (this.blurTimer !== null) clearTimeout(this.blurTimer);
    this.blurTimer = null;
  }
}
