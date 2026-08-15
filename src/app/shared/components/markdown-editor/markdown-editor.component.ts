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
import { insertNewlineAndIndent } from '@codemirror/commands';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

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
  readonly readOnly = input(false);
  readonly submitOnEnter = input(false);
  readonly keywordHighlights = input<readonly MarkdownKeywordHighlight[]>([]);
  readonly valueChange = output<string>();
  readonly submitRequested = output<void>();
  readonly keywordClick = output<MarkdownKeywordClick>();

  readonly editorView = signal<EditorView | null>(null);
  private readonly editorHost = viewChild.required<ElementRef<HTMLDivElement>>('editorHost');
  private readonly readOnlyCompartment = new Compartment();

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

    effect(() => {
      const view = this.editorView();
      const readOnly = this.readOnly();
      if (!view) return;

      view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(this.createReadOnlyExtensions(readOnly)),
      });
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
        Prec.highest(keymap.of([
          {
            key: 'Enter',
            run: () => {
              if (!this.submitOnEnter()) return false;
              if (this.readOnly()) return true;

              this.submitRequested.emit();
              return true;
            },
          },
          {
            key: 'Shift-Enter',
            run: view => this.submitOnEnter() ? insertNewlineAndIndent(view) : false,
          },
        ])),
        ...createMarkdownExtensions(
          this.placeholder(),
          event => this.keywordClick.emit(event),
        ),
        this.readOnlyCompartment.of(this.createReadOnlyExtensions(this.readOnly())),
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

  private createReadOnlyExtensions(readOnly: boolean) {
    return [
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({
        'aria-readonly': readOnly ? 'true' : 'false',
      }),
    ];
  }
}
