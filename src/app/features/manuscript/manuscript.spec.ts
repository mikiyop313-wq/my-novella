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
    invoke: async (channel: string) => {
      if (channel === 'ai:list-models') return [];
      if (channel === 'manuscript:getWordCount') return 0;
      if (channel === 'manuscript:getBookHierarchy') return [];
      if (channel === 'manuscript:get') return [];
      return null;
    },
    onBeforeClose: () => undefined,
    removeBeforeCloseHandler: () => undefined,
  };

  beforeEach(async () => {
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
});

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
