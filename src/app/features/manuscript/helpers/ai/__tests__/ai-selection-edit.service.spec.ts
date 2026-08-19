import { TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiStreamService } from '../../../../../core/services/ai-stream.service';
import { CodexContextTrieService } from '../../../../codex/services/codex-context-trie.service';
import { CodexService } from '../../../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../../../workspace/services/manuscript-structure.service';
import { UniqueIdExtension } from '../../../extensions/unique-id.extension';
import { AiStreamEditorService } from '../ai-stream-editor.service';
import { AiSelectionEditService } from '../ai-selection-edit.service';

const SceneSummary = Node.create({
  name: 'sceneSummary',
  group: 'block',
  atom: true,
  addAttributes: () => ({ id: { default: '' }, title: { default: '' } }),
  parseHTML: () => [{ tag: 'scene-summary' }],
  renderHTML: ({ HTMLAttributes }) => ['scene-summary', HTMLAttributes],
});

describe('AiSelectionEditService', () => {
  let service: AiSelectionEditService;
  let editor: Editor;
  let streamText: ReturnType<typeof vi.fn>;
  let releaseSceneGeneration: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    streamText = vi.fn();
    releaseSceneGeneration = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        AiSelectionEditService,
        { provide: AiStreamService, useValue: { streamText, stopStream: vi.fn() } },
        {
          provide: AiStreamEditorService,
          useValue: {
            acquireSceneGeneration: vi.fn(() => true),
            releaseSceneGeneration,
          },
        },
        {
          provide: CodexContextTrieService,
          useValue: {
            trie: () => ({}), isLoading: () => false, error: () => null, findMatches: vi.fn(() => []),
          },
        },
        { provide: CodexService, useValue: { getEntry: vi.fn() } },
        { provide: ManuscriptStructureService, useValue: { getOutline: vi.fn() } },
      ],
    });
    service = TestBed.inject(AiSelectionEditService);
    editor = createEditor();
    selectText(editor, 'Original passage.');
  });

  afterEach(() => {
    editor?.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('keeps an edit in memory while its editor component is detached', async () => {
    const id = startEdit(service, editor);
    expect(id).not.toBeNull();

    service.detachEditor(editor);

    expect(service.getSession(id!)).not.toBeNull();
    expect(service.getSession(id!)?.attachedEditor).toBeNull();
    expect(editor.getText()).toContain('Original passage.');

    const replacementEditor = createEditor();
    service.attachEditor(replacementEditor, 'book-1');
    expect(service.getSession(id!)?.attachedEditor).toBe(replacementEditor);
    expect(service.getSession(id!)?.selection).not.toBeNull();

    await service.cancel(id!);
    expect(service.getSession(id!)).toBeNull();
    expect(releaseSceneGeneration).toHaveBeenCalledWith({ sceneId: 'scene-1', ownerId: id });
    replacementEditor.destroy();
  });

  it('restores ready previews after navigation without exposing them to persistence', async () => {
    streamText.mockResolvedValue('Replacement passage.');
    const id = startEdit(service, editor)!;

    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(service.getSession(id)?.state()).toBe('ready');
    expect(editor.getText()).toContain('Replacement passage.');
    expect(service.persistenceSafeDocument(editor).textContent).toContain('Original passage.');
    expect(service.persistenceSafeDocument(editor).textContent).not.toContain('Replacement passage.');

    service.detachEditor(editor);
    expect(editor.getText()).toContain('Original passage.');

    const replacementEditor = createEditor();
    service.attachEditor(replacementEditor, 'book-1');
    expect(replacementEditor.getText()).toContain('Replacement passage.');
    expect(service.confirm(id)).toBe(true);
    expect(service.getSession(id)).toBeNull();
    expect(replacementEditor.commands.undo()).toBe(true);
    expect(replacementEditor.getText()).toContain('Original passage.');
    replacementEditor.destroy();
  });
});

function createEditor(): Editor {
  return new Editor({
    extensions: [StarterKit, Markdown, SceneSummary, UniqueIdExtension],
    content: {
      type: 'doc',
      content: [
        { type: 'sceneSummary', attrs: { id: 'scene-1', title: 'Scene' } },
        {
          type: 'paragraph',
          attrs: { id: 'paragraph-1' },
          content: [{ type: 'text', text: 'Before. Original passage. After.' }],
        },
      ],
    },
  });
}

function selectText(editor: Editor, text: string): void {
  const from = editor.state.doc.textBetween(0, editor.state.doc.content.size).indexOf(text) + 1;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(
    editor.state.doc,
    from,
    from + text.length,
  )));
}

function startEdit(service: AiSelectionEditService, targetEditor: Editor): string | null {
  return service.startEdit({
    editor: targetEditor,
    bookId: 'book-1',
    bookTitle: 'Book One',
    request: {
      category: 'rephrase',
      instruction: 'Rephrase the marked passage.',
      actionLabel: 'Rephrase',
    },
  });
}
