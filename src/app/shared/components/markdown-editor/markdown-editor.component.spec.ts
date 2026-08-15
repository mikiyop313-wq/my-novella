import { redo, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  markdownFormattingKeymap,
} from './markdown-editor.extensions';
import { MarkdownEditorComponent } from './markdown-editor.component';

describe('MarkdownEditorComponent', () => {
  let fixture: ComponentFixture<MarkdownEditorComponent>;
  let component: MarkdownEditorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkdownEditorComponent],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('renders inline Markdown and reveals editable delimiters only for the focused span', async () => {
    await createEditor('A **bold** and *italic*.');

    expect(visibleText()).toContain('A bold and italic.');
    expect(visibleText()).not.toContain('**');
    expect(query('.cm-md-strong')?.textContent).toBe('bold');
    expect(query('.cm-md-emphasis')?.textContent).toBe('italic');

    const view = editorView();
    view.focus();
    view.dispatch({ selection: EditorSelection.cursor(5) });

    expect(visibleText()).toContain('**bold**');
    expect(visibleText()).not.toContain('*italic*');

    view.dispatch({ changes: { from: 2, to: 4, insert: '' } });
    expect(view.state.doc.toString()).toBe('A bold** and *italic*.');
    expect(query('.cm-md-strong')).toBeNull();
  });

  it('reveals all active delimiters for nested formatting and complete link source', async () => {
    await createEditor('***fearless*** and [Mara](https://example.com)');

    expect(visibleText()).toContain('fearless and Mara');
    expect(visibleText()).not.toContain('https://example.com');

    const view = editorView();
    view.focus();
    view.dispatch({ selection: EditorSelection.cursor(4) });
    expect(visibleText()).toContain('***fearless***');

    const linkPosition = view.state.doc.toString().indexOf('Mara') + 1;
    view.dispatch({ selection: EditorSelection.cursor(linkPosition) });
    expect(visibleText()).toContain('[Mara](https://example.com)');
    expect(visibleText()).not.toContain('***fearless***');
  });

  it('renders block constructs and reveals their source markers in the active block', async () => {
    const source = '# Heading\n\nSubheading\n----------\n\n- item\n> quote\n\n```js\nconst x = 1\n```\n\n---';
    await createEditor(source);

    expect(query('.cm-md-heading-1')).not.toBeNull();
    expect(query('.cm-md-heading-2')).not.toBeNull();
    expect(query('.cm-md-marker-line-hidden')).not.toBeNull();
    expect(query('.cm-md-list-marker')?.textContent).toBe('•');
    expect(query('.cm-md-blockquote')).not.toBeNull();
    expect(queryAll('.cm-md-code-fence-hidden')).toHaveLength(2);
    expect(query('.cm-md-horizontal-rule')).not.toBeNull();

    const view = editorView();
    view.focus();
    view.dispatch({ selection: EditorSelection.cursor(source.indexOf('Heading') + 1) });
    expect(visibleText()).toContain('# Heading');

    view.dispatch({ selection: EditorSelection.cursor(source.indexOf('item') + 1) });
    expect(query('.cm-md-list-marker')).toBeNull();
    expect(visibleText()).toContain('- item');

    view.dispatch({ selection: EditorSelection.cursor(source.indexOf('const') + 2) });
    expect(queryAll('.cm-md-code-fence-hidden')).toHaveLength(0);
    expect(visibleText()).toContain('```js');
  });

  it('preserves malformed and unsupported Markdown as literal source', async () => {
    const source = [
      '**unfinished',
      '',
      '![alt](image.png)',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '<span>raw html</span>',
    ].join('\n');
    await createEditor(source);

    expect(editorView().state.doc.toString()).toBe(source);
    expect(visibleText()).toContain('**unfinished');
    expect(visibleText()).toContain('![alt](image.png)');
    expect(visibleText()).toContain('| A | B |');
    expect(visibleText()).toContain('<span>raw html</span>');
  });

  it('supports formatting shortcuts, unwrapping, links, and undo/redo', async () => {
    await createEditor('word');
    const view = editorView();
    view.focus();
    view.dispatch({ selection: EditorSelection.range(0, 4) });

    runShortcut('Mod-b');
    expect(view.state.doc.toString()).toBe('**word**');
    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.selection.main.to).toBe(6);

    runShortcut('Mod-b');
    expect(view.state.doc.toString()).toBe('word');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('**word**');
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('word');

    view.dispatch({ selection: EditorSelection.range(0, 4) });
    runShortcut('Mod-i');
    expect(view.state.doc.toString()).toBe('*word*');
    undo(view);

    view.dispatch({ selection: EditorSelection.range(0, 4) });
    runShortcut('Mod-Shift-x');
    expect(view.state.doc.toString()).toBe('~~word~~');
    undo(view);

    view.dispatch({ selection: EditorSelection.range(0, 4) });
    runShortcut('Mod-e');
    expect(view.state.doc.toString()).toBe('`word`');
    undo(view);

    view.dispatch({ selection: EditorSelection.range(0, 4) });
    runShortcut('Mod-k');
    expect(view.state.doc.toString()).toBe('[word](url)');
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('url');
  });

  it('inserts paired delimiters at an empty caret', async () => {
    await createEditor('word');
    const view = editorView();
    view.dispatch({ selection: EditorSelection.cursor(2) });

    runShortcut('Mod-b');

    expect(view.state.doc.toString()).toBe('wo****rd');
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('emits exact user source while applying external values without feedback or history', async () => {
    await createEditor('Original');
    const emitted = vi.fn();
    component.valueChange.subscribe(emitted);
    const view = editorView();

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'User **edit**' } });
    expect(emitted).toHaveBeenCalledWith('User **edit**');

    fixture.componentRef.setInput('value', 'External *draft*');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(view.state.doc.toString()).toBe('External *draft*');
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('External *draft*');
  });

  it('shows the default placeholder and destroys its EditorView', async () => {
    await createEditor('');
    expect(query('.cm-placeholder')?.textContent).toBe('Write Markdown...');

    const view = editorView();
    const destroy = vi.spyOn(view, 'destroy');
    fixture.destroy();

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('keeps the default Enter behavior when submit-on-enter is disabled', async () => {
    await createEditor('Draft');

    pressKey('Enter');

    expect(editorView().state.doc.toString()).toBe('Draft\n');
  });

  it('submits on Enter and inserts a line break on Shift+Enter when enabled', async () => {
    await createEditor('Draft');
    fixture.componentRef.setInput('submitOnEnter', true);
    fixture.detectChanges();
    const submitted = vi.fn();
    component.submitRequested.subscribe(submitted);

    pressKey('Enter');
    expect(submitted).toHaveBeenCalledOnce();
    expect(editorView().state.doc.toString()).toBe('Draft');

    pressKey('Enter', { shiftKey: true });
    expect(submitted).toHaveBeenCalledOnce();
    expect(editorView().state.doc.toString()).toBe('Draft\n');
  });

  it('reactively applies read-only editing and accessibility state', async () => {
    await createEditor('Draft');
    const view = editorView();

    expect(view.state.facet(EditorState.readOnly)).toBe(false);
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('true');
    expect(view.contentDOM.getAttribute('aria-readonly')).toBe('false');

    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(view.state.facet(EditorState.readOnly)).toBe(true);
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
    expect(view.contentDOM.getAttribute('aria-readonly')).toBe('true');
    expect(view.state.doc.toString()).toBe('Draft');
  });

  it('highlights visible prose while excluding code and link destinations', async () => {
    const source = 'Mara [Mara](https://mara.test) `Mara`\n\n```txt\nMara\n```';
    await createEditor(source);
    const ranges = [...source.matchAll(/Mara|mara/g)].map((match, index) => ({
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      entryIds: [`codex-${index}`],
    }));

    fixture.componentRef.setInput('keywordHighlights', ranges);
    fixture.detectChanges();
    await fixture.whenStable();

    expect([...queryAll('.cm-codex-keyword')].map(element => element.textContent)).toEqual([
      'Mara',
      'Mara',
    ]);
    expect(editorView().state.doc.toString()).toBe(source);
  });

  it('emits matching entry IDs for an unmodified keyword click', async () => {
    await createEditor('Mara');
    fixture.componentRef.setInput('keywordHighlights', [
      { startIndex: 0, endIndex: 4, entryIds: ['codex-1', 'codex-2'] },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const emitted = vi.fn();
    component.keywordClick.subscribe(emitted);
    vi.spyOn(editorView(), 'posAtCoords').mockReturnValue(2);
    query('.cm-codex-keyword')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
      clientX: 24,
      clientY: 36,
    }));

    expect(emitted).toHaveBeenCalledWith({
      entryIds: ['codex-1', 'codex-2'],
      clientX: 24,
      clientY: 36,
    });

    query('.cm-codex-keyword')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
      ctrlKey: true,
      clientX: 24,
      clientY: 36,
    }));
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  async function createEditor(value: string): Promise<void> {
    fixture = TestBed.createComponent(MarkdownEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function editorView() {
    const view = component.editorView();
    if (!view) throw new Error('Expected CodeMirror editor view');
    return view;
  }

  function visibleText(): string {
    return query('.cm-content')?.textContent ?? '';
  }

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function queryAll(selector: string): NodeListOf<HTMLElement> {
    return fixture.nativeElement.querySelectorAll(selector);
  }

  function runShortcut(key: string): void {
    const binding = markdownFormattingKeymap.find(candidate => candidate.key === key);
    if (!binding) throw new Error(`Missing shortcut ${key}`);
    expect(binding.run(editorView())).toBe(true);
  }

  function pressKey(key: string, init: KeyboardEventInit = {}): void {
    const view = editorView();
    view.focus();
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }));
  }
});
