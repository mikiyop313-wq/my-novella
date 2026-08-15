import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { ToastService } from '../../shared/services/toast.service';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import { CodexContextHighlightRegistryService } from '../codex/highlighting/codex-context-highlight-registry.service';
import { CodexMatchChooserService } from '../codex/highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { Outline } from './outline';
import { OutlineStore } from './store/outline.store';

describe('Outline', () => {
  let component: Outline;
  let fixture: ComponentFixture<Outline>;
  let store: any;
  let toastService: Pick<ToastService, 'error'>;
  const trieState = signal<object | null>({});
  const contextTrie = {
    trie: trieState.asReadonly(),
    findMatches: vi.fn((text: string) => findCodexMatches(text)),
  };
  const highlightRegistry = {
    setRanges: vi.fn(),
    clearRanges: vi.fn(),
    getEntryIdsAtPoint: vi.fn<() => string[]>(() => []),
  };
  const matchChooser = { open: vi.fn() };

  beforeEach(async () => {
    trieState.set({});
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findCodexMatches(text));
    highlightRegistry.setRanges.mockClear();
    highlightRegistry.clearRanges.mockClear();
    highlightRegistry.getEntryIdsAtPoint.mockReset().mockReturnValue([]);
    matchChooser.open.mockClear();

    store = {
      bookId: signal('book-1'),
      isLoading: signal(false),
      error: signal(null),
      bookHierarchy: signal([]),
      enterBook: vi.fn().mockResolvedValue(undefined),
      createAct: vi.fn().mockResolvedValue(undefined),
      createChapter: vi.fn().mockResolvedValue(undefined),
      createScene: vi.fn().mockResolvedValue(undefined),
      deleteAct: vi.fn().mockResolvedValue(undefined),
      deleteChapter: vi.fn().mockResolvedValue(undefined),
      deleteScene: vi.fn().mockResolvedValue(undefined),
      archiveAct: vi.fn().mockResolvedValue(undefined),
      archiveChapter: vi.fn().mockResolvedValue(undefined),
      archiveScene: vi.fn().mockResolvedValue(undefined),
      updateAct: vi.fn().mockResolvedValue(undefined),
      updateChapter: vi.fn().mockResolvedValue(undefined),
      updateScene: vi.fn().mockResolvedValue(undefined),
      updateStructurePositions: vi.fn().mockResolvedValue(undefined),
    };

    toastService = {
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Outline],
      providers: [
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              paramMap: of(convertToParamMap({ bookId: 'book-1' })),
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn().mockResolvedValue(true),
          },
        },
        { provide: OutlineStore, useValue: store },
        { provide: ToastService, useValue: toastService },
        { provide: CodexContextTrieService, useValue: contextTrie },
        { provide: CodexContextHighlightRegistryService, useValue: highlightRegistry },
        { provide: CodexMatchChooserService, useValue: matchChooser },
        ...provideMarkdown(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Outline);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the outline for the current book', () => {
    expect(store.enterBook).toHaveBeenCalledWith('book-1');
  });

  it('creates an act through the outline store', async () => {
    await component.createAct('book-1');

    expect(store.createAct).toHaveBeenCalledWith('book-1');
  });

  it('deletes an act through the outline store', async () => {
    await component.deleteAct('act-1');

    expect(store.deleteAct).toHaveBeenCalledWith('act-1');
  });

  it('archives a scene through the outline store', async () => {
    await component.archiveScene('scene-1');

    expect(store.archiveScene).toHaveBeenCalledWith('scene-1');
  });

  it('updates titles and scene summaries through the outline store', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);

    await component.updateActTitle('act-1', 'Renamed Act');
    await component.updateChapterTitle('chapter-1', 'Renamed Chapter');
    await component.updateSceneTitle('scene-1', 'Renamed Scene');
    await component.updateSceneSummary('scene-1', 'New scene summary');

    expect(store.updateAct).toHaveBeenCalledWith({ id: 'act-1', title: 'Renamed Act' });
    expect(store.updateChapter).toHaveBeenCalledWith({ id: 'chapter-1', title: 'Renamed Chapter' });
    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', title: 'Renamed Scene' });
    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', summary: 'New scene summary' });
  });

  it('edits scene summaries with the Markdown editor and saves the draft on focus loss', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary', wordCount: 0 },
            ],
          },
        ],
      },
    ]);
    component.editing.set({ 'scene-1': true });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const editorDebugElement = fixture.debugElement.query(By.directive(MarkdownEditorComponent));
    expect(editorDebugElement).not.toBeNull();
    expect(fixture.nativeElement.querySelector('textarea.scene-summary-input')).toBeNull();
    expect(fixture.nativeElement.querySelector('markdown.scene-summary-markdown')).toBeNull();

    const editor = editorDebugElement.componentInstance as MarkdownEditorComponent;
    const view = editor.editorView();
    expect(view).not.toBeNull();
    expect(view?.state.doc.toString()).toBe('Scene summary');

    view?.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '**New** summary' },
    });

    expect(component.sceneSummaryDrafts()['scene-1']).toBe('**New** summary');
    expect(store.updateScene).not.toHaveBeenCalled();

    view?.contentDOM.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    await vi.waitFor(() => {
      expect(store.updateScene).toHaveBeenCalledWith({
        id: 'scene-1',
        summary: '**New** summary',
      });
    });
    expect(component.sceneSummaryDrafts()['scene-1']).toBeUndefined();
  });

  it('renders sanitized Markdown for scene summaries in view mode', async () => {
    showScene([
      'Mara **Vale** and *fearless*.',
      '',
      '- First beat',
      '- Second beat',
      '',
      '<script>alert(1)</script>',
    ].join('\n'));
    await fixture.whenStable();
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector(
      'markdown.scene-summary-markdown',
    ) as HTMLElement;

    expect(summary).not.toBeNull();
    expect(summary.querySelector('strong')?.textContent).toBe('Vale');
    expect(summary.querySelector('em')?.textContent).toBe('fearless');
    expect(summary.querySelectorAll('li')).toHaveLength(2);
    expect(summary.querySelector('script')).toBeNull();
    expect(summary.textContent).not.toContain('**');
  });

  it('highlights Codex keywords across rendered Markdown elements', async () => {
    highlightRegistry.setRanges.mockClear();
    contextTrie.findMatches.mockClear();
    showScene('Mara **Vale** enters.');
    await fixture.whenStable();
    fixture.detectChanges();
    await waitForHighlightScan();

    const ranges = highlightRegistry.setRanges.mock.calls.at(-1)?.[1] ?? [];
    expect(ranges.map((item: { range: Range }) => item.range.toString())).toEqual(['Mara Vale']);
  });

  it('opens Codex keywords without opening the manuscript scene', async () => {
    showScene('Mara **Vale** enters.');
    await fixture.whenStable();
    fixture.detectChanges();
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: true } as Selection);
    const openManuscript = vi.spyOn(component, 'openManuscript');
    const keyword = fixture.nativeElement.querySelector(
      'markdown.scene-summary-markdown strong',
    ) as HTMLElement;

    highlightRegistry.getEntryIdsAtPoint.mockReturnValueOnce(['codex-1']);
    keyword.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 12,
      clientY: 20,
    }));

    expect(matchChooser.open).toHaveBeenCalledWith(['codex-1'], 12, 20);
    expect(openManuscript).not.toHaveBeenCalled();

    highlightRegistry.getEntryIdsAtPoint.mockReturnValueOnce([]);
    keyword.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

    expect(openManuscript).toHaveBeenCalledWith('scene', 'scene-1');
  });

  it('shows an unscanned placeholder for an empty scene summary', async () => {
    contextTrie.findMatches.mockClear();
    showScene('   ');
    await fixture.whenStable();
    fixture.detectChanges();
    await waitForHighlightScan();

    expect(fixture.nativeElement.querySelector('markdown.scene-summary-markdown')).toBeNull();
    expect(fixture.nativeElement.querySelector('.scene-summary-empty')?.textContent)
      .toContain('No summary yet...');
    expect(contextTrie.findMatches).not.toHaveBeenCalled();
  });

  it('skips unchanged title updates', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [],
      },
    ]);
    component.editing.set({ 'act-1': true });

    await component.updateActTitle('act-1', 'Act 1');

    expect(store.updateAct).not.toHaveBeenCalled();
    expect(component.editing()['act-1']).toBe(false);
  });

  it('normalizes whitespace-only edits to an empty string', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);

    await component.updateSceneSummary('scene-1', '   ');

    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', summary: '' });
  });

  it('shows update failures as toast errors and keeps edit mode open', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [],
      },
    ]);
    component.editing.set({ 'act-1': true });
    store.updateAct.mockRejectedValueOnce(new Error('Update exploded'));

    await component.updateActTitle('act-1', 'Renamed Act');

    expect(toastService.error).toHaveBeenCalledWith('Update exploded', 'Outline');
    expect(component.editing()['act-1']).toBe(true);
  });

  it('retains a scene summary draft when saving fails', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);
    component.editing.set({ 'scene-1': true });
    component.updateSceneSummaryDraft('scene-1', 'Unsaved **summary**');
    store.updateScene.mockRejectedValueOnce(new Error('Update exploded'));

    await component.updateSceneSummary('scene-1', 'Unsaved **summary**');

    expect(component.sceneSummaryDrafts()['scene-1']).toBe('Unsaved **summary**');
    expect(component.editing()['scene-1']).toBe(true);
    expect(toastService.error).toHaveBeenCalledWith('Update exploded', 'Outline');
  });

  it('keeps scene editing active when focus moves from title to summary', async () => {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary: 'Scene summary' },
            ],
          },
        ],
      },
    ]);
    const card = document.createElement('div');
    card.className = 'scene-card';
    const titleInput = document.createElement('input');
    const summaryInput = document.createElement('textarea');
    card.append(titleInput, summaryInput);

    await component.updateSceneTitle('scene-1', 'Renamed Scene', {
      target: titleInput,
      relatedTarget: summaryInput,
    } as unknown as FocusEvent);

    expect(store.updateScene).toHaveBeenCalledWith({ id: 'scene-1', title: 'Renamed Scene' });
    expect(component.editing()['scene-1']).toBe(true);
  });

  it('saves act positions from the reordered drop data', async () => {
    await component.onActDrop({
      previousIndex: 0,
      currentIndex: 1,
      container: {
        data: [
          { id: 'act-1', bookId: 'book-1' },
          { id: 'act-2', bookId: 'book-1' },
        ],
      },
    } as any);

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      acts: [
        { id: 'act-2', bookId: 'book-1', position: 0 },
        { id: 'act-1', bookId: 'book-1', position: 1 },
      ],
    });
  });

  it('saves chapter positions for both source and target acts', async () => {
    await component.onChapterDrop({
      previousIndex: 0,
      currentIndex: 1,
      previousContainer: {
        id: 'outline-chapters-act-1',
        data: [{ id: 'chapter-1' }, { id: 'chapter-2' }],
      },
      container: {
        id: 'outline-chapters-act-2',
        data: [{ id: 'chapter-3' }],
      },
    } as any, 'act-2');

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      chapters: [
        { id: 'chapter-2', actId: 'act-1', position: 0 },
        { id: 'chapter-3', actId: 'act-2', position: 0 },
        { id: 'chapter-1', actId: 'act-2', position: 1 },
      ],
    });
  });

  it('saves scene positions for both source and target chapters', async () => {
    await component.onSceneDrop({
      previousIndex: 1,
      currentIndex: 0,
      previousContainer: {
        id: 'outline-scenes-chapter-1',
        data: [{ id: 'scene-1' }, { id: 'scene-2' }],
      },
      container: {
        id: 'outline-scenes-chapter-2',
        data: [{ id: 'scene-3' }],
      },
    } as any, 'chapter-2');

    expect(store.updateStructurePositions).toHaveBeenCalledWith({
      scenes: [
        { id: 'scene-1', chapterId: 'chapter-1', position: 0 },
        { id: 'scene-2', chapterId: 'chapter-2', position: 0 },
        { id: 'scene-3', chapterId: 'chapter-2', position: 1 },
      ],
    });
  });

  it('shows store failures as toast errors', async () => {
    store.createScene.mockRejectedValueOnce(new Error('Scene exploded'));

    await component.createScene('chapter-1');

    expect(toastService.error).toHaveBeenCalledWith('Scene exploded', 'Outline');
  });

  it('closes all open menus on scroll', () => {
    const mockTrigger1 = {
      isOpen: vi.fn().mockReturnValue(true),
      close: vi.fn(),
    };
    const mockTrigger2 = {
      isOpen: vi.fn().mockReturnValue(false),
      close: vi.fn(),
    };

    const queryList = {
      forEach: (callback: any) => [mockTrigger1, mockTrigger2].forEach(callback),
      some: (callback: any) => [mockTrigger1, mockTrigger2].some(callback),
    } as any;
    (component as any).menuTriggers = queryList;

    const scrollEvent = new Event('scroll');
    window.dispatchEvent(scrollEvent);

    expect(mockTrigger1.isOpen).toHaveBeenCalled();
    expect(mockTrigger1.close).toHaveBeenCalled();
    expect(mockTrigger2.isOpen).toHaveBeenCalled();
    expect(mockTrigger2.close).not.toHaveBeenCalled();
  });

  function showScene(summary: string): void {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary, wordCount: 0 },
            ],
          },
        ],
      },
    ]);
    component.editing.set({});
    fixture.detectChanges();
  }

  async function waitForHighlightScan(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
});

function findCodexMatches(text: string) {
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
