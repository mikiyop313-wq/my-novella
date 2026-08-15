import { EditorSelection } from '@codemirror/state';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDetailDto } from '../../../../../../shared/models/codex.model';
import type { CodexEntryMenuPayload } from '../../../../../../shared/models/codex-window.model';
import { MarkdownEditorComponent } from '../../../../shared/components/markdown-editor/markdown-editor.component';
import { CodexEntryMenuComponent } from './codex-entry-menu.component';

describe('CodexEntryMenuComponent live Markdown description', () => {
  let fixture: ComponentFixture<CodexEntryMenuComponent>;
  let component: CodexEntryMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodexEntryMenuComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CodexEntryMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('initialType', 'character');
    fixture.componentRef.setInput('entityDropdownOptions', [{ value: 'character', label: 'Character' }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('loads the exact stored Markdown into the live editor', async () => {
    fixture.componentRef.setInput('existingEntry', createEntry({ description: 'A **bold** hero' }));
    await render();

    expect(markdownEditor().editorView()?.state.doc.toString()).toBe('A **bold** hero');
    expect(fixture.nativeElement.querySelector('textarea.description-editor')).toBeNull();
    expect(fixture.nativeElement.querySelector('markdown.description-markdown-content')).toBeNull();
  });

  it('applies a detached draft description to the editor', async () => {
    fixture.componentRef.setInput('initialDraft', createDraft({ description: 'Detached *draft*' }));
    await render();

    expect(markdownEditor().editorView()?.state.doc.toString()).toBe('Detached *draft*');
    expect(component.newEntryDescription()).toBe('Detached *draft*');
  });

  it('keeps raw Markdown in state and autosaves it unchanged', async () => {
    fixture.componentRef.setInput('existingEntry', createEntry({ description: 'Original' }));
    await render();
    vi.useFakeTimers();
    const updated = vi.fn();
    component.entryUpdated.subscribe(updated);
    const view = markdownEditor().editorView()!;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'Updated **source**' },
      selection: EditorSelection.cursor('Updated **source**'.length),
    });
    fixture.detectChanges();
    vi.advanceTimersByTime(300);

    expect(component.newEntryDescription()).toBe('Updated **source**');
    expect(updated).toHaveBeenCalledTimes(1);
    expect(updated.mock.calls[0]?.[0].description).toBe('Updated **source**');
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function markdownEditor(): MarkdownEditorComponent {
    const debugElement = fixture.debugElement.query(By.directive(MarkdownEditorComponent));
    if (!debugElement) throw new Error('Expected shared Markdown editor');
    return debugElement.componentInstance as MarkdownEditorComponent;
  }
});

function createEntry(overrides: Partial<CodexEntryDetailDto> = {}): CodexEntryDetailDto {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Mara Vale',
    alias: null,
    description: null,
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    entryNotes: [],
    entryProgression: [],
    ...overrides,
  };
}

function createDraft(overrides: Partial<CodexEntryMenuPayload> = {}): CodexEntryMenuPayload {
  return {
    type: 'character',
    name: 'Mara Vale',
    alias: '',
    description: '',
    trackingSetting: 'include_when_detected',
    notes: [],
    progression: [],
    ...overrides,
  };
}
