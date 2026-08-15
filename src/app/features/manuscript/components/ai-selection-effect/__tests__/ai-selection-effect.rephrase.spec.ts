import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiStreamService, type AiStreamRequest } from '../../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { AiSelectionEffectComponent } from '../ai-selection-effect.component';

const SceneSummary = Node.create({
  name: 'sceneSummary',
  group: 'block',
  atom: true,
  addAttributes: () => ({
    id: { default: '' },
    title: { default: '' },
    summary: { default: '' },
  }),
  parseHTML: () => [{ tag: 'scene-summary' }],
  renderHTML: ({ HTMLAttributes }) => ['scene-summary', HTMLAttributes],
});

describe('AiSelectionEffectComponent AI rephrasing', () => {
  let fixture: ComponentFixture<AiSelectionEffectComponent>;
  let component: AiSelectionEffectComponent;
  let editor: Editor;
  let streamText: ReturnType<typeof vi.fn>;
  let toastService: { error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    editor = new Editor({
      extensions: [StarterKit, Markdown, SceneSummary],
      content: {
        type: 'doc',
        content: [
          {
            type: 'sceneSummary',
            attrs: {
              id: 'scene-1',
              title: 'The Confrontation',
              summary: 'Mara confronts Elias.',
            },
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Before passage.' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Elias looked away.' }],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'After passage.' }] },
        ],
      },
    });
    selectText(editor, 'Elias looked away.');

    streamText = vi.fn();
    toastService = { error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AiSelectionEffectComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal(editor) } },
        { provide: WorkspaceStore, useValue: { bookId: signal('book-1') } },
        { provide: AiStreamService, useValue: { streamText, stopStream: vi.fn() } },
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AiSelectionEffectComponent);
    component = fixture.componentInstance;
    vi.spyOn(component as any, 'updatePosition').mockReturnValue(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    editor?.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('uses the rephrase preset, buffers tokens, and previews only after completion', async () => {
    let finishStream!: () => void;
    streamText.mockImplementation((request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return new Promise<string>(resolve => finishStream = () => resolve('Elias lowered his gaze.'));
    });

    expect(component.startRephrase()).toBe(true);
    expect(component.startRephrase()).toBe(false);
    await vi.advanceTimersByTimeAsync(600);

    expect(editor.getText()).toContain('Elias looked away.');
    expect(editor.getText()).not.toContain('Elias lowered his gaze.');
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      systemPromptCategory: 'rephrase',
      prompt: expect.stringContaining('--- PASSAGE TO REPHRASE ---\nElias looked away.'),
    }));

    finishStream();
    await vi.runAllTimersAsync();

    expect(component.state()).toBe('ready');
    expect(editor.getText()).toContain('Elias lowered his gaze.');
    expect(editor.getText()).not.toContain('Elias looked away.');
  });

  it('keeps the effect active and maps its range through surrounding edits', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startRephrase();
    editor.commands.insertContentAt(findTextPosition(editor, 'Before passage.'), 'New lead. ');

    expect(component.state()).toBe('drawing');
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(component.state()).toBe('ready');
    expect(editor.getText()).toContain('New lead. Before passage.');
    expect(editor.getText()).toContain('Elias lowered his gaze.');
    expect(editor.getText()).not.toContain('Elias looked away.');
  });

  it('protects the framed text while allowing boundary and surrounding edits', () => {
    streamText.mockReturnValue(new Promise(() => undefined));
    component.startRephrase();
    const originalFrom = findTextPosition(editor, 'Elias looked away.');
    const originalDocument = editor.getJSON();

    editor.commands.insertContentAt(originalFrom + 1, 'blocked');
    editor.commands.deleteRange({ from: originalFrom - 1, to: originalFrom + 1 });
    editor.chain()
      .setTextSelection({ from: originalFrom, to: originalFrom + 'Elias'.length })
      .toggleItalic()
      .run();

    expect(editor.getJSON()).toEqual(originalDocument);
    expect(component.state()).toBe('drawing');

    editor.commands.insertContentAt(originalFrom, 'Left ');
    const mappedFrom = findTextPosition(editor, 'Elias looked away.');
    editor.commands.insertContentAt(mappedFrom + 'Elias looked away.'.length, ' right');
    editor.commands.insertContentAt(findTextPosition(editor, 'After passage.'), 'Nearby ');

    expect(editor.getText()).toContain('Left Elias looked away. right');
    expect(editor.getText()).toContain('Nearby After passage.');
    expect(component.state()).toBe('drawing');

    expect(editor.commands.undo()).toBe(true);
    expect(component.state()).toBe('drawing');
    expect(editor.commands.redo()).toBe(true);
    expect(component.state()).toBe('drawing');
  });

  it('restores the original prose without discarding surrounding edits when cancelled', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startRephrase();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    editor.commands.insertContentAt(findTextPosition(editor, 'After passage.'), 'Persistent note. ');
    component.cancel();

    expect(editor.getText()).toContain('Elias looked away.');
    expect(editor.getText()).not.toContain('Elias lowered his gaze.');
    expect(editor.getText()).toContain('Persistent note. After passage.');
    expect(component.state()).toBe('idle');
  });

  it('commits one undoable replacement after confirmation', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startRephrase();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    editor.commands.insertContentAt(findTextPosition(editor, 'After passage.'), 'Persistent note. ');
    component.confirm();

    expect(editor.getText()).toContain('Elias lowered his gaze.');
    expect(editor.getText()).toContain('Persistent note. After passage.');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain('Elias looked away.');
    expect(editor.getText()).toContain('Persistent note. After passage.');
  });

  it('keeps the original prose when the model returns no content', async () => {
    const originalDocument = editor.getJSON();
    streamText.mockResolvedValue('');

    component.startRephrase();
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(editor.getJSON()).toEqual(originalDocument);
    expect(component.state()).toBe('idle');
    expect(toastService.error).toHaveBeenCalledWith(
      'The model returned an empty rephrase.',
      'AI Rephrase',
    );
  });
});

function selectText(editor: Editor, text: string): void {
  const from = findTextPosition(editor, text);
  if (from < 0) throw new Error(`Text not found: ${text}`);
  editor.view.dispatch(editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, from, from + text.length),
  ));
}

function findTextPosition(editor: Editor, text: string): number {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(text)) {
      from = pos + node.text.indexOf(text);
    }
  });
  if (from < 0) throw new Error(`Text not found: ${text}`);
  return from;
}
