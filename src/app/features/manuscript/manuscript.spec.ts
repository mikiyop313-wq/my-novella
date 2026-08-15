import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { undoDepth } from '@tiptap/pm/history';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { ElectronService } from '../../core/services/electron.service';
import { CodexContextHighlightRegistryService } from '../codex/highlighting/codex-context-highlight-registry.service';
import { CodexMatchChooserService } from '../codex/highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../codex/services/codex-entry-opener.service';
import { Manuscript } from './manuscript';
import { ManuscriptProseSaverService } from './helpers/saving/manuscript-prose-saver.service';
import { ManuscriptParagraphVectorSyncService } from './helpers/saving/manuscript-paragraph-vector-sync.service';

const electronInvoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>();

describe('Manuscript', () => {
  let component: Manuscript;
  let fixture: ComponentFixture<Manuscript>;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  const trieState = signal<object | null>({});
  const contextTrie = {
    trie: trieState.asReadonly(),
    findMatches: vi.fn((text: string) => findMatches(text)),
    loadForContext: vi.fn(),
  };
  const registry = {
    setRanges: vi.fn(),
    clearRanges: vi.fn(),
    getEntryIdsAtPoint: vi.fn(() => []),
  };
  const electronServiceMock = {
    invoke: (channel: string, payload?: unknown) => electronInvoke(channel, payload),
    onBeforeClose: () => undefined,
    removeBeforeCloseHandler: () => undefined,
  };

  beforeEach(async () => {
    electronInvoke.mockReset();
    electronInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'ai:list-models') return [];
      if (channel === 'manuscript:getWordCount') return 0;
      if (channel === 'manuscript:getBookHierarchy') return [];
      if (channel === 'manuscript:get') return [];
      if (channel === 'vectors:getBookIndexingConfiguration') {
        return { available: true, automaticIndexingEnabled: true };
      }
      return undefined;
    });
    frameCallbacks = new Map();
    nextFrameId = 1;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn((id: number) => frameCallbacks.delete(id)),
    });
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findMatches(text));
    contextTrie.loadForContext.mockClear();
    registry.setRanges.mockClear();
    registry.clearRanges.mockClear();
    trieState.set({});

    await TestBed.configureTestingModule({
      imports: [Manuscript],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ mode: 'book', id: 'book-1' }),
            parent: {
              snapshot: {
                paramMap: convertToParamMap({ bookId: 'book-1' }),
              },
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: () => Promise.resolve(true),
          },
        },
        {
          provide: ElectronService,
          useValue: electronServiceMock,
        },
        { provide: CodexContextTrieService, useValue: contextTrie },
        { provide: CodexContextHighlightRegistryService, useValue: registry },
        { provide: CodexMatchChooserService, useValue: { open: vi.fn() } },
        { provide: CodexEntryOpenerService, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Manuscript);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    flushFrames();
    registry.setRanges.mockClear();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalRequestAnimationFrame,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: originalCancelAnimationFrame,
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders pending, active, and updated indexing states', async () => {
    const vectorSync = TestBed.inject(ManuscriptParagraphVectorSyncService);
    await vectorSync.refreshIndexingConfiguration('book-1');
    fixture.detectChanges();
    expect(statusText()).toContain('Index up to date');

    vectorSync.snapshotDirtyParagraphs('scene-1', [paragraphNode('paragraph-1', 'Queued edit')]);
    fixture.detectChanges();
    expect(statusText()).toContain('Waiting to index');

    let completeUpsert!: () => void;
    electronInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'vectors:upsertParagraphs') {
        return new Promise<void>(resolve => {
          completeUpsert = resolve;
        });
      }
      if (channel === 'vectors:getBookIndexingConfiguration') {
        return { available: true, automaticIndexingEnabled: true };
      }
      return undefined;
    });

    const flush = vectorSync.flushParagraphVectorChanges();
    fixture.detectChanges();
    expect(statusText()).toContain('Indexing');

    completeUpsert();
    await flush;
    fixture.detectChanges();
    expect(statusText()).toContain('Index up to date');
  });

  it('renders indexing failures and retries them', async () => {
    const vectorSync = TestBed.inject(ManuscriptParagraphVectorSyncService);
    await vectorSync.refreshIndexingConfiguration('book-1');
    vectorSync.snapshotDirtyParagraphs('scene-1', [paragraphNode('paragraph-1', 'Failed edit')]);
    electronInvoke.mockRejectedValueOnce(new Error('Embedding failed'));

    await vectorSync.flushParagraphVectorChanges();
    fixture.detectChanges();

    expect(statusText()).toContain('Indexing failed');
    const retry = vi.spyOn(vectorSync, 'retryParagraphVectorChanges').mockResolvedValue();
    const retryButton = fixture.nativeElement.querySelector('.indexing-status button') as HTMLButtonElement;
    retryButton.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows a manual indexing action without a loader while work is pending', async () => {
    const vectorSync = TestBed.inject(ManuscriptParagraphVectorSyncService);
    electronInvoke.mockResolvedValueOnce({
      available: true,
      automaticIndexingEnabled: false,
    });
    await vectorSync.refreshIndexingConfiguration('book-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.indexing-update-button')).toBeNull();

    vectorSync.snapshotDirtyParagraphs('scene-1', [paragraphNode('paragraph-1', 'Queued edit')]);
    fixture.detectChanges();

    const updateButton = fixture.nativeElement.querySelector(
      '.indexing-update-button',
    ) as HTMLButtonElement;
    expect(updateButton.getAttribute('aria-label')).toBe('Update index');
    expect(updateButton.textContent).toContain('Manual indexing');
    expect(fixture.nativeElement.querySelector('.indexing-spinner')).toBeNull();

    let completeUpsert!: () => void;
    electronInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'vectors:upsertParagraphs') {
        return new Promise<void>(resolve => {
          completeUpsert = resolve;
        });
      }
      return undefined;
    });
    const flush = vi.spyOn(vectorSync, 'flushParagraphVectorChanges');
    updateButton.click();
    expect(flush).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect(statusText()).toContain('Indexing');
    expect(fixture.nativeElement.querySelector('.indexing-spinner')).not.toBeNull();

    completeUpsert();
    await flush.mock.results[0].value;
  });

  it('highlights across inline marks without joining separate editor blocks', async () => {
    setEditorContent();
    await Promise.resolve();
    flushFrames();

    const ranges = registry.setRanges.mock.calls.at(-1)?.[1] ?? [];
    expect(ranges.map((item: { range: Range }) => item.range.toString())).toEqual(['Mara Vale']);
    expect(contextTrie.findMatches).toHaveBeenCalledWith('Silver');
    expect(contextTrie.findMatches).toHaveBeenCalledWith('Key');
    expect(contextTrie.findMatches).not.toHaveBeenCalledWith('SilverKey');
    expect(contextTrie.loadForContext).not.toHaveBeenCalled();
  });

  it('keeps editor JSON, history, and save callbacks unchanged during highlight refresh', async () => {
    setEditorContent();
    await Promise.resolve();
    flushFrames();

    const editor = component.editor!;
    const saver = TestBed.inject(ManuscriptProseSaverService);
    const saveSpy = vi.spyOn(saver, 'onDocumentChanged');
    const jsonBefore = JSON.stringify(editor.getJSON());
    const undoDepthBefore = undoDepth(editor.state);
    registry.setRanges.mockClear();

    trieState.set({ refreshed: true });
    fixture.detectChanges();
    flushFrames();

    expect(registry.setRanges).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editor.getJSON())).toBe(jsonBefore);
    expect(undoDepth(editor.state)).toBe(undoDepthBefore);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(contextTrie.loadForContext).not.toHaveBeenCalled();
  });

  function setEditorContent(): void {
    component.editor!.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Mara ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'Vale' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Silver' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Key' }] },
      ],
    });
  }

  function flushFrames(): void {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  }

  function statusText(): string {
    return fixture.nativeElement.querySelector('.indexing-status')?.textContent ?? '';
  }
});

function paragraphNode(id: string, text: string): Record<string, unknown> {
  return {
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  };
}

function findMatches(text: string) {
  return [...text.matchAll(/Mara\s+Vale/gi)].map((match) => ({
    term: 'mara vale',
    value: {
      entryId: 'codex-1',
      trackingSetting: 'include_when_detected' as const,
      status: 'active' as const,
    },
    startIndex: match.index,
    endIndex: match.index + match[0].length,
    text: match[0],
  }));
}
