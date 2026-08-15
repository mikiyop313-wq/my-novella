import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  createMarkdownExtensions,
  type MarkdownKeywordClick,
  type MarkdownKeywordHighlight,
  updateMarkdownKeywordHighlights,
} from './markdown-editor.extensions';

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  template: '<div #editorHost class="markdown-editor-host"></div>',
  styleUrl: './markdown-editor.component.scss',
})
export class MarkdownEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input('');
  readonly placeholder = input('Write Markdown...');
  readonly ariaLabel = input('Markdown editor');
  readonly keywordHighlights = input<readonly MarkdownKeywordHighlight[]>([]);
  readonly valueChange = output<string>();
  readonly keywordClick = output<MarkdownKeywordClick>();

  readonly editorView = signal<EditorView | null>(null);
  private readonly editorHost = viewChild.required<ElementRef<HTMLDivElement>>('editorHost');

  constructor() {
    effect(() => {
      const view = this.editorView();
      const nextValue = this.value();
      if (!view || view.state.doc.toString() === nextValue) return;

      view.setState(this.createEditorState(nextValue));
      updateMarkdownKeywordHighlights(view, untracked(this.keywordHighlights));
    });

    effect(() => {
      const view = this.editorView();
      const highlights = this.keywordHighlights();
      if (view) updateMarkdownKeywordHighlights(view, highlights);
    });
  }

  ngAfterViewInit(): void {
    const view = new EditorView({
      state: this.createEditorState(this.value()),
      parent: this.editorHost().nativeElement,
    });

    this.editorView.set(view);
  }

  ngOnDestroy(): void {
    this.editorView()?.destroy();
    this.editorView.set(null);
  }

  private createEditorState(value: string): EditorState {
    return EditorState.create({
      doc: value,
      selection: { anchor: value.length },
      extensions: [
        ...createMarkdownExtensions(
          this.placeholder(),
          event => this.keywordClick.emit(event),
        ),
        EditorView.contentAttributes.of({
          'aria-label': this.ariaLabel(),
          spellcheck: 'true',
        }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) this.valueChange.emit(update.state.doc.toString());
        }),
      ],
    });
  }
}
