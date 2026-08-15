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
import { ToastService } from '../../shared/services/toast.service';

const electronInvoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>();
import { WorkspaceBookStore } from '../workspace/workspace-book.store';
import type { ActDto } from '../../../../shared/models/manuscript.model';

describe('Manuscript', () => {
  let component: Manuscript;
  let fixture: ComponentFixture<Manuscript>;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalResizeObserver: typeof ResizeObserver | undefined;
  let originalIntersectionObserver: typeof IntersectionObserver | undefined;
  let routerNavigate: ReturnType<typeof vi.fn>;
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
    originalResizeObserver = globalThis.ResizeObserver;
    originalIntersectionObserver = globalThis.IntersectionObserver;
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
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    });
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: class {
        root = null;
        rootMargin = '';
        thresholds = [];
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] { return []; }
      },
    });
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findMatches(text));
    contextTrie.loadForContext.mockClear();
    registry.setRanges.mockClear();
    registry.clearRanges.mockClear();
    trieState.set({});
    routerNavigate = vi.fn().mockResolvedValue(true);

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
            navigate: routerNavigate,
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
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: originalIntersectionObserver,
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a create-scene hint only while the loaded scope has no scenes', () => {
    component.hasLoadedContent.set(true);
    component.hasSceneNodes.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.manuscript-empty-hint')?.textContent)
      .toContain('Create a scene before you start writing.');

    const editor = component.editor!;
    const sceneSummary = editor.schema.nodes['sceneSummary'].create({ id: 'scene-1' });
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, [
      sceneSummary,
      editor.schema.nodes['paragraph'].create(),
    ]);
    tr.setMeta('skipSaver', true);
    editor.view.dispatch(tr);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.manuscript-empty-hint')).toBeNull();
  });

  it.each([
    ['insertAct', 'Act creation failed'],
    ['insertChapter', 'Chapter creation failed'],
    ['insertScene', 'Scene creation failed'],
  ] as const)('shows a toast when %s fails', async (method, message) => {
    const toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    vi.spyOn(component.store, method).mockRejectedValueOnce(new Error(message));

    await component[method]();

    expect(toastError).toHaveBeenCalledWith(message, 'Manuscript');
  });

  it('uses a fallback toast message for a non-Error creation failure', async () => {
    const toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
    vi.spyOn(component.store, 'insertAct').mockRejectedValueOnce('failed');

    await component.insertAct();

    expect(toastError).toHaveBeenCalledWith('Failed to create act.', 'Manuscript');
  });

  it('enables hierarchy creation only when the required parent exists', () => {
    expect(component.canInsertChapter()).toBe(false);
    expect(component.canInsertScene()).toBe(false);

    const editor = component.editor!;
    const actHeader = editor.schema.nodes['actHeader'].create({ id: 'act-1' });
    let tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, actHeader);
    tr.setMeta('skipSaver', true);
    editor.view.dispatch(tr);

    expect(component.canInsertChapter()).toBe(true);
    expect(component.canInsertScene()).toBe(false);

    const chapterHeader = editor.schema.nodes['chapterHeader'].create({ id: 'chapter-1' });
    tr = editor.state.tr.insert(editor.state.doc.content.size, chapterHeader);
    tr.setMeta('skipSaver', true);
    editor.view.dispatch(tr);

    expect(component.canInsertScene()).toBe(true);
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

  it('builds labels for each manuscript scope', () => {
    const workspaceBookStore = TestBed.inject(WorkspaceBookStore);
    const hierarchy: ActDto[] = [{
      id: 'act-1',
      title: 'The Beginning',
      bookId: 'book-1',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [{
        id: 'chapter-1',
        title: 'First Steps',
        actId: 'act-1',
        position: 2,
        status: 'active',
        summary: null,
        scenes: [{
          id: 'scene-1',
          title: 'A Door Opens',
          chapterId: 'chapter-1',
          position: 1,
          status: 'active',
          prose: null,
          summary: null,
          wordCount: null,
          pointOfViewOverride: null,
          povCharacterIdOverride: null,
        }],
      }],
    }];
    workspaceBookStore.setBookHierarchy(hierarchy);

    component.store.setRouteParams('book', 'book-1');
    expect(component.currentScopeLabel()).toBe('Full Novel');

    component.store.setRouteParams('act', 'act-1');
    expect(component.currentScopeLabel()).toBe('Act 1: The Beginning');

    component.store.setActiveSection('scene', 'scene-1');
    expect(component.currentScopeLabel()).toBe('Act 1: The Beginning');

    component.store.setRouteParams('chapter', 'chapter-1');
    expect(component.currentScopeLabel()).toBe('Chapter 3: First Steps');

    component.store.setRouteParams('scene', 'scene-1');
    expect(component.currentScopeLabel()).toBe('Scene 2: A Door Opens');
  });

  it('uses untitled labels in the view scope', () => {
    const workspaceBookStore = TestBed.inject(WorkspaceBookStore);
    workspaceBookStore.setBookHierarchy([{
      id: 'act-1',
      title: '',
      bookId: 'book-1',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [],
    }]);

    component.store.setRouteParams('act', 'act-1');

    expect(component.currentScopeLabel()).toBe('Act 1: Untitled Act');
  });

  it.each([
    { mode: 'scene' as const, id: 'scene-1', deleteEntity: 'deleteScene' as const, parentMode: 'chapter', parentId: 'chapter-1', channel: 'manuscript:deleteScene' },
    { mode: 'chapter' as const, id: 'chapter-1', deleteEntity: 'deleteChapter' as const, parentMode: 'act', parentId: 'act-1', channel: 'manuscript:deleteChapter' },
    { mode: 'act' as const, id: 'act-1', deleteEntity: 'deleteAct' as const, parentMode: 'book', parentId: 'book-1', channel: 'manuscript:deleteAct' },
  ])('persists and navigates after deleting the active $mode', async ({
    mode,
    id,
    deleteEntity,
    parentMode,
    parentId,
    channel,
  }) => {
    setRemovalHierarchyAndDocument();
    component.store.setRouteParams(mode, id);
    routerNavigate.mockClear();
    electronInvoke.mockClear();

    component.store[deleteEntity](id);

    await vi.waitFor(() => {
      expect(electronInvoke).toHaveBeenCalledWith(channel, { id });
      expect(routerNavigate).toHaveBeenCalledWith(
        ['/workspace', 'book-1', 'manuscript', parentMode, parentId],
        { replaceUrl: true },
      );
      expect(electronInvoke.mock.invocationCallOrder.at(-1))
        .toBeLessThan(routerNavigate.mock.invocationCallOrder[0]);
    });
  });

  it.each([
    { mode: 'scene' as const, id: 'scene-1', archiveEntity: 'archiveScene' as const, parentMode: 'chapter', parentId: 'chapter-1', channel: 'manuscript:archiveScene' },
    { mode: 'chapter' as const, id: 'chapter-1', archiveEntity: 'archiveChapter' as const, parentMode: 'act', parentId: 'act-1', channel: 'manuscript:archiveChapter' },
    { mode: 'act' as const, id: 'act-1', archiveEntity: 'archiveAct' as const, parentMode: 'book', parentId: 'book-1', channel: 'manuscript:archiveAct' },
  ])('navigates after archiving the active $mode', async ({
    mode,
    id,
    archiveEntity,
    parentMode,
    parentId,
    channel,
  }) => {
    setRemovalHierarchyAndDocument();
    component.store.setRouteParams(mode, id);
    routerNavigate.mockClear();
    electronInvoke.mockClear();

    await component.store[archiveEntity](id);

    expect(electronInvoke).toHaveBeenCalledWith(channel, { id });
    await vi.waitFor(() => expect(routerNavigate).toHaveBeenCalledWith(
      ['/workspace', 'book-1', 'manuscript', parentMode, parentId],
      { replaceUrl: true },
    ));
  });

  it('does not navigate when removing a nested entity from a broader view', async () => {
    setRemovalHierarchyAndDocument();
    component.store.setRouteParams('chapter', 'chapter-1');
    routerNavigate.mockClear();

    await component.store.archiveScene('scene-1');

    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('retains the active entity and route when archiving fails', async () => {
    setRemovalHierarchyAndDocument();
    component.store.setRouteParams('act', 'act-1');
    routerNavigate.mockClear();
    electronInvoke.mockRejectedValueOnce(new Error('Archive failed'));

    await expect(component.store.archiveAct('act-1')).rejects.toThrow('Archive failed');

    expect(component.editor?.getJSON().content?.some(node => (
      node.type === 'actHeader' && node.attrs?.['id'] === 'act-1'
    ))).toBe(true);
    expect(routerNavigate).not.toHaveBeenCalled();
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
    component.editor!.chain().command(({ tr }) => {
      tr.setMeta('skipSaver', true);
      return true;
    }).setContent({
      type: 'doc',
      content: [
        {
          type: 'sceneSummary',
          attrs: { id: 'scene-1', chapterId: 'chapter-1', title: '', summary: '', position: 0 },
        },
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
    }).run();
  }

  function setRemovalHierarchyAndDocument(): void {
    const workspaceBookStore = TestBed.inject(WorkspaceBookStore);
    workspaceBookStore.setBookHierarchy([{
      id: 'act-1',
      title: 'Act',
      bookId: 'book-1',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [{
        id: 'chapter-1',
        title: 'Chapter',
        actId: 'act-1',
        position: 0,
        status: 'active',
        summary: null,
        scenes: [{
          id: 'scene-1',
          title: 'Scene',
          chapterId: 'chapter-1',
          position: 0,
          status: 'active',
          prose: null,
          summary: null,
          wordCount: 0,
          pointOfViewOverride: null,
          povCharacterIdOverride: null,
        }],
      }],
    }]);

    const editor = component.editor!;
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, [
      editor.schema.nodes['actHeader'].create({ id: 'act-1', bookId: 'book-1' }),
      editor.schema.nodes['chapterHeader'].create({ id: 'chapter-1', actId: 'act-1' }),
      editor.schema.nodes['sceneSummary'].create({ id: 'scene-1', chapterId: 'chapter-1' }),
      editor.schema.nodes['paragraph'].create(),
    ]);
    tr.setMeta('skipSaver', true);
    editor.view.dispatch(tr);
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
