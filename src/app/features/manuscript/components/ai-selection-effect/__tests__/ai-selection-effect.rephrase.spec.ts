import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CodexEntryDetailDto, CodexTrackingSetting } from '../../../../../../../shared/models/codex.model';
import type { ActDto } from '../../../../../../../shared/models/manuscript.model';
import { AiStreamService, type AiStreamRequest } from '../../../../../core/services/ai-stream.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { CodexContextTrieService } from '../../../../codex/services/codex-context-trie.service';
import { CodexService } from '../../../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../../../workspace/services/manuscript-structure.service';
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

describe('AiSelectionEffectComponent AI selection edits', () => {
  let fixture: ComponentFixture<AiSelectionEffectComponent>;
  let component: AiSelectionEffectComponent;
  let editor: Editor;
  let streamText: ReturnType<typeof vi.fn>;
  let getOutline: ReturnType<typeof vi.fn>;
  let getEntry: ReturnType<typeof vi.fn>;
  let findMatches: ReturnType<typeof vi.fn>;
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
              id: 'scene-0',
              title: 'The Arrival',
              summary: 'Mara arrives at the estate.',
            },
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Mara entered quietly.' }] },
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
    getOutline = vi.fn().mockResolvedValue(createOutline());
    getEntry = vi.fn();
    findMatches = vi.fn((_text: string): any[] => []);
    toastService = { error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AiSelectionEffectComponent],
      providers: [
        { provide: ManuscriptStore, useValue: { editor: signal(editor) } },
        {
          provide: WorkspaceStore,
          useValue: { bookId: signal('book-1'), bookTitle: signal('Book One') },
        },
        {
          provide: CodexContextTrieService,
          useValue: {
            trie: signal({}), isLoading: signal(false), error: signal(null), findMatches,
          },
        },
        { provide: CodexService, useValue: { getEntry } },
        { provide: ManuscriptStructureService, useValue: { getOutline } },
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

    expect(startEdit(component)).toBe(true);
    expect(startEdit(component)).toBe(false);
    await vi.advanceTimersByTimeAsync(600);

    expect(editor.getText()).toContain('Elias looked away.');
    expect(editor.getText()).not.toContain('Elias lowered his gaze.');
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      bookId: 'book-1',
      aiPrompt: expect.objectContaining({
        systemPromptCategory: 'rephrase',
        prompt: expect.stringContaining('--- PASSAGE TO EDIT ---\nElias looked away.'),
      }),
    }));

    finishStream();
    await vi.runAllTimersAsync();

    expect(component.state()).toBe('ready');
    expect(editor.getText()).toContain('Elias lowered his gaze.');
    expect(editor.getText()).not.toContain('Elias looked away.');
  });

  it.each([
    ['rephrase', 'Rephrase', 'Rephrase the marked passage.'],
    ['rephrase', 'Other', 'Make the exchange more tense.'],
  ] as const)('offers an inline comparison for %s/%s', async (category, actionLabel, instruction) => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({ category, actionLabel, instruction });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    component.bounds.set({ top: 20, left: 20, width: 260, height: 60 });
    fixture.detectChanges();

    const compareButton = fixture.nativeElement.querySelector('.compare-button') as HTMLButtonElement | null;
    expect(compareButton).not.toBeNull();
    expect(compareButton?.getAttribute('aria-expanded')).toBe('false');
    expect(component.comparisonSegments()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'removed', text: expect.stringContaining('looked') }),
      expect.objectContaining({ kind: 'added', text: expect.stringContaining('lowered') }),
    ]));

    const previewDocument = editor.getJSON();
    compareButton?.click();
    fixture.detectChanges();

    expect(component.isComparisonVisible()).toBe(true);
    expect(component.frameHeight()).toBe(108);
    expect(editor.getJSON()).not.toEqual(previewDocument);
    expect(editor.getText()).toContain('Elias looked away lowered his gaze.');
    expect(editor.view.dom.querySelector('.ai-selection-comparison-removed')?.textContent)
      .toContain('looked away');
    expect(editor.view.dom.querySelector('.ai-selection-comparison-added')?.textContent)
      .toContain('lowered his gaze');
    expect(editor.view.dom.querySelector<HTMLElement>('.ai-selection-action-spacer')?.style.height)
      .toBe('48px');

    (fixture.nativeElement.querySelector('.compare-button') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();

    expect(component.isComparisonVisible()).toBe(false);
    expect(editor.getJSON()).toEqual(previewDocument);
    expect(editor.view.dom.querySelector<HTMLElement>('.ai-selection-action-spacer')?.style.height)
      .toBe('48px');
  });

  it.each([
    ['expand', 'Expand'],
    ['shorten', 'Shorten'],
  ] as const)('does not offer comparison for %s', async (category, actionLabel) => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({
      category,
      actionLabel,
      instruction: `${actionLabel} the marked passage.`,
    });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    component.bounds.set({ top: 20, left: 20, width: 260, height: 60 });
    fixture.detectChanges();

    expect(component.canCompare()).toBe(false);
    expect(fixture.nativeElement.querySelector('.compare-button')).toBeNull();
  });

  it('keeps the effect active and maps its range through surrounding edits', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    startEdit(component);
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
    startEdit(component);
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

    startEdit(component);
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    component.toggleComparison();
    editor.commands.insertContentAt(findTextPosition(editor, 'After passage.'), 'Persistent note. ');
    component.cancel();

    expect(editor.getText()).toContain('Elias looked away.');
    expect(editor.getText()).not.toContain('Elias lowered his gaze.');
    expect(editor.getText()).toContain('Persistent note. After passage.');
    expect(component.state()).toBe('idle');
    expect(component.isComparisonVisible()).toBe(false);
    expect(component.comparisonSegments()).toEqual([]);
  });

  it('commits one undoable replacement after confirmation', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    startEdit(component);
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();
    component.toggleComparison();
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

    startEdit(component);
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(editor.getJSON()).toEqual(originalDocument);
    expect(component.state()).toBe('idle');
    expect(toastService.error).toHaveBeenCalledWith(
      'The model returned an empty rephrase result.',
      'AI Rephrase',
    );
  });

  it.each([
    ['expand', 'Expand', 'Expand the marked passage.'],
    ['shorten', 'Shorten', 'Shorten the marked passage.'],
    ['rephrase', 'Other', 'Make the exchange more tense.'],
  ] as const)('uses the %s preset for the %s action', async (category, actionLabel, instruction) => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({ category, actionLabel, instruction });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      aiPrompt: expect.objectContaining({
        systemPromptCategory: category,
        prompt: expect.stringContaining(`Instruction: ${instruction}`),
      }),
    }));
  });

  it.each([
    ['expand', 'Expand'],
    ['shorten', 'Shorten'],
  ] as const)('adds outline and eligible detected Codex context for %s', async (category, actionLabel) => {
    findMatches.mockReturnValue([
      codexMatch('eligible-1', 'include_when_detected'),
      codexMatch('eligible-1', 'include_when_detected'),
      codexMatch('eligible-2', 'always_include'),
      codexMatch('manual', 'manual'),
      codexMatch('never', 'never_include'),
    ]);
    getEntry.mockImplementation(async (id: string) => createCodexEntry(
      id,
      id === 'eligible-1' ? 'Elias' : 'The Watcher',
      id === 'eligible-1' ? 'include_when_detected' : 'always_include',
    ));
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({
      category,
      actionLabel,
      instruction: `${actionLabel} the marked passage.`,
    });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(findMatches).toHaveBeenCalledWith('Elias looked away.');
    expect(getEntry.mock.calls).toEqual([['eligible-1'], ['eligible-2']]);
    const prompt = streamText.mock.calls[0][0].aiPrompt.prompt as string;
    expect(prompt).toContain('## Outline');
    expect(prompt).toContain('Mara arrives at the estate.');
    expect(prompt).not.toContain('Mara confronts Elias.');
    expect(prompt).toContain('## Codex Context');
    expect(prompt).toContain('### Elias');
    expect(prompt).toContain('### The Watcher');
    expect(prompt).not.toContain('Scene: The Confrontation');
    expect(prompt).toContain('--- BEGIN SCENE 2');
    expect(prompt).toContain('The Confrontation ---');
    expect(prompt.indexOf('--- BEGIN SCENE 2')).toBeLessThan(
      prompt.indexOf('--- PASSAGE TO EDIT ---'),
    );
    expect(prompt.indexOf('--- PASSAGE TO EDIT ---')).toBeLessThan(
      prompt.indexOf('--- END SCENE 2'),
    );
    expect(prompt.indexOf('--- END SCENE 2')).toBeLessThan(prompt.indexOf('## Codex Context'));
  });

  it('includes the partial outline without loading Codex details when nothing is detected', async () => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({
      category: 'expand',
      actionLabel: 'Expand',
      instruction: 'Expand the marked passage.',
    });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(getOutline).toHaveBeenCalledWith('book-1');
    expect(getEntry).not.toHaveBeenCalled();
    expect(streamText.mock.calls[0][0].aiPrompt.prompt).toContain('## Outline');
    expect(streamText.mock.calls[0][0].aiPrompt.prompt).not.toContain('## Codex Context');
  });

  it.each([
    ['rephrase', 'Rephrase', 'Rephrase the marked passage.'],
    ['rephrase', 'Other', 'Make the exchange more tense.'],
  ] as const)('keeps %s/%s scene-local', async (category, actionLabel, instruction) => {
    streamText.mockImplementation(async (request: AiStreamRequest) => {
      request.onToken?.('Elias lowered his gaze.');
      return 'Elias lowered his gaze.';
    });

    component.startEdit({ category, actionLabel, instruction });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(getOutline).not.toHaveBeenCalled();
    expect(findMatches).not.toHaveBeenCalled();
    expect(getEntry).not.toHaveBeenCalled();
    expect(streamText.mock.calls[0][0].aiPrompt.prompt).not.toContain('## Outline');
    expect(streamText.mock.calls[0][0].aiPrompt.prompt).not.toContain('## Codex Context');
  });

  it('does not stream when required context preparation fails', async () => {
    getOutline.mockRejectedValue(new Error('Outline unavailable'));

    component.startEdit({
      category: 'shorten',
      actionLabel: 'Shorten',
      instruction: 'Shorten the marked passage.',
    });
    await vi.advanceTimersByTimeAsync(600);
    await vi.runAllTimersAsync();

    expect(streamText).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
    expect(toastService.error).toHaveBeenCalledWith('Could not complete shorten.', 'AI Shorten');
  });

  it('does not stream when cancelled during context preparation', async () => {
    const outline = deferred<ActDto[]>();
    getOutline.mockReturnValue(outline.promise);

    component.startEdit({
      category: 'expand',
      actionLabel: 'Expand',
      instruction: 'Expand the marked passage.',
    });
    await vi.advanceTimersByTimeAsync(600);
    component.cancel();
    outline.resolve(createOutline());
    await vi.runAllTimersAsync();

    expect(streamText).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });
});

function startEdit(component: AiSelectionEffectComponent): boolean {
  return component.startEdit({
    category: 'rephrase',
    instruction: 'Rephrase the marked passage.',
    actionLabel: 'Rephrase',
  });
}

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

function createOutline(): ActDto[] {
  return [{
    id: 'act-1',
    bookId: 'book-1',
    title: 'Act One',
    position: 0,
    status: 'active',
    summary: null,
    chapters: [{
      id: 'chapter-1',
      actId: 'act-1',
      title: 'Chapter One',
      position: 0,
      status: 'active',
      summary: null,
      scenes: [
        createScene('scene-0', 'The Arrival', 0, 'Mara arrives at the estate.'),
        createScene('scene-1', 'The Confrontation', 1, 'Mara confronts Elias.'),
      ],
    }],
  }];
}

function createScene(id: string, title: string, position: number, summary: string) {
  return {
    id,
    chapterId: 'chapter-1',
    title,
    position,
    status: 'active' as const,
    prose: null,
    summary,
    wordCount: 0,
    pointOfViewOverride: null,
    povCharacterIdOverride: null,
  };
}

function codexMatch(entryId: string, trackingSetting: CodexTrackingSetting) {
  return {
    term: entryId,
    value: { entryId, trackingSetting, status: 'active' as const },
    startIndex: 0,
    endIndex: entryId.length,
    text: entryId,
  };
}

function createCodexEntry(
  id: string,
  name: string,
  trackingSetting: CodexTrackingSetting,
): CodexEntryDetailDto {
  return {
    id,
    bookId: 'book-1',
    type: 'character',
    name,
    alias: null,
    description: `${name} description.`,
    image: null,
    status: 'active',
    trackingSetting,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    entryNotes: [],
    entryProgression: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(innerResolve => resolve = innerResolve);
  return { promise, resolve };
}
