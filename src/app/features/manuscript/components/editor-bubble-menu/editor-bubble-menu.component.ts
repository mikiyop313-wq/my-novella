import { Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, signal, inject, NgZone, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Editor } from '@tiptap/core';
import { OverlayMenuDirective } from '../../../../shared/directives/overlay-menu.directive';


@Component({
  selector: 'app-editor-bubble-menu',
  standalone: true,
  imports: [CommonModule, OverlayMenuDirective],
  templateUrl: './editor-bubble-menu.component.html',
  styleUrl: './editor-bubble-menu.component.scss'
})
export class EditorBubbleMenuComponent implements OnInit, OnDestroy {
  editor = input.required<Editor>();
  @ViewChild('menuRef') menuRef!: ElementRef<HTMLDivElement>;

  private zone = inject(NgZone);

  // Responsive signals for UI
  isVisible = signal(false);
  isBelow = signal(false);
  top = signal(0);
  left = signal(0);
  wordCount = signal(0);

  ngOnInit(): void {
    if (!this.editor()) return;

    // Register Tiptap event listeners
    this.editor().on('selectionUpdate', this.onSelectionUpdate);
    this.editor().on('focus', this.onSelectionUpdate);
    this.editor().on('blur', this.onBlur);

    // Listen to window resize and scroll events (capturing to detect scrolling in containers)
    window.addEventListener('resize', this.onSelectionUpdate);
    window.addEventListener('scroll', this.onSelectionUpdate, true);
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor().off('selectionUpdate', this.onSelectionUpdate);
      this.editor().off('focus', this.onSelectionUpdate);
      this.editor().off('blur', this.onBlur);
    }

    window.removeEventListener('resize', this.onSelectionUpdate);
    window.removeEventListener('scroll', this.onSelectionUpdate, true);
  }

  private onSelectionUpdate = () => {
    this.zone.run(() => {
      this.updateMenuPosition();
    });
  };

  private onBlur = () => {
    // Delay hiding slightly to allow clicks on formatting buttons inside the menu
    setTimeout(() => {
      this.zone.run(() => {
        const activeEl = document.activeElement;
        if (this.menuRef?.nativeElement && activeEl && this.menuRef.nativeElement.contains(activeEl)) {
          return;
        }
        this.isVisible.set(false);
      });
    }, 150);
  };

  private updateMenuPosition(): void {
    if (!this.editor) {
      this.isVisible.set(false);
      return;
    }

    const { state } = this.editor();
    const { selection } = state;

    // Check if there is a text selection
    if (!selection || selection.empty || selection.from === selection.to) {
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

  // AI assistant stubs as requested (empty methods for now)
  rephrase(): void {
    const text = this.getSelectedText();
    console.log('AI Action - Rephrase triggered for: ', text);
  }

  shorten(): void {
    const text = this.getSelectedText();
    console.log('AI Action - Shorten triggered for: ', text);
  }

  expand(): void {
    const text = this.getSelectedText();
    console.log('AI Action - Expand triggered for: ', text);
  }

  private getSelectedText(): string {
    if (!this.editor) return '';
    const { state } = this.editor();
    return state.doc.textBetween(state.selection.from, state.selection.to, ' ');
  }
}
