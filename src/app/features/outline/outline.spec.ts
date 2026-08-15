import { CdkMenuTrigger } from '@angular/cdk/menu';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { provideMarkdown } from 'ngx-markdown';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AiStreamService } from '../../core/services/ai-stream.service';
import { ElectronService } from '../../core/services/electron.service';
import { ToastService } from '../../shared/services/toast.service';
import { SystemPromptModelService } from '../../shared/services/system-prompt-model.service';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import { CodexContextHighlightRegistryService } from '../codex/highlighting/codex-context-highlight-registry.service';
import { CodexMatchChooserService } from '../codex/highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { CodexService } from '../codex/services/codex.service';
import { CodexStore } from '../codex/store/codex.store';
import { Outline } from './outline';
import { OutlineStore } from './store/outline.store';
import { withEffectiveContextInclusion } from '../../../../shared/utils/manuscript-context-inclusion';

describe('Outline', () => {
  const sceneCardModeStorageKey = 'outline-scene-card-mode';

  let component: Outline;
  let fixture: ComponentFixture<Outline>;
  let store: any;
  let systemPromptModelService: { resolveActiveModel: ReturnType<typeof vi.fn> };
  let aiStreamService: { streamText: ReturnType<typeof vi.fn> };
  let electronService: { invoke: ReturnType<typeof vi.fn> };
  let codexService: { getEntries: ReturnType<typeof vi.fn>; createEntry: ReturnType<typeof vi.fn> };
  let codexStore: any;
  let toastService: Pick<ToastService, 'error' | 'info' | 'success'>;
  const trieState = signal<object | null>({});
  const contextTrie = {
    trie: trieState.asReadonly(),
    findMatches: vi.fn((text: string) => findCodexMatches(text)),
    refreshCurrentContext: vi.fn().mockResolvedValue(undefined),
  };
  const highlightRegistry = {
    setRanges: vi.fn(),
    clearRanges: vi.fn(),
    getEntryIdsAtPoint: vi.fn<() => string[]>(() => []),
  };
  const matchChooser = { open: vi.fn() };

  beforeEach(async () => {
    localStorage.removeItem(sceneCardModeStorageKey);
    trieState.set({});
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findCodexMatches(text));
    contextTrie.refreshCurrentContext.mockClear();
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
      setContextInclusion: vi.fn().mockImplementation(async (payload: any) => {
        const hierarchy = store.bookHierarchy().map((act: any) => ({
          ...act,
          chapters: (act.chapters ?? []).map((chapter: any) => ({
            ...chapter,
            scenes: (chapter.scenes ?? []).map((scene: any) => ({
              ...scene,
              includeInContext: payload.entityType === 'act' && act.id === payload.id
                || payload.entityType === 'chapter' && chapter.id === payload.id
                || payload.entityType === 'scene' && scene.id === payload.id
                ? payload.included
                : scene.includeInContext,
            })),
          })),
        }));
        store.bookHierarchy.set(withEffectiveContextInclusion(hierarchy));
      }),
    };

    systemPromptModelService = {
      resolveActiveModel: vi.fn().mockResolvedValue(readySummaryModel()),
    };
    aiStreamService = {
      streamText: vi.fn().mockResolvedValue('Generated summary'),
    };
    electronService = {
      invoke: vi.fn().mockResolvedValue({
        'scene-1': proseDocument('Scene prose.'),
      }),
    };
    codexService = {
      getEntries: vi.fn().mockResolvedValue([]),
      createEntry: vi.fn().mockResolvedValue({ id: 'created-entry' }),
    };
    codexStore = {
      activeType: signal('character'),
      searchQuery: signal(''),
      entryFilters: signal({}),
      loadEntries: vi.fn().mockResolvedValue(undefined),
    };

    toastService = {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
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
        { provide: SystemPromptModelService, useValue: systemPromptModelService },
        { provide: AiStreamService, useValue: aiStreamService },
        { provide: ElectronService, useValue: electronService },
        { provide: CodexService, useValue: codexService },
        { provide: CodexStore, useValue: codexStore },
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

  it('adds title text as a tooltip only when the title overflows', () => {
    const title = document.createElement('span');
    title.textContent = 'A very long scene title';
    Object.defineProperties(title, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 180 },
      clientHeight: { configurable: true, value: 20 },
      scrollHeight: { configurable: true, value: 20 },
    });

    component.updateOverflowTooltip(title);

    expect(title.getAttribute('title')).toBe('A very long scene title');

    Object.defineProperty(title, 'scrollWidth', { configurable: true, value: 100 });
    component.updateOverflowTooltip(title);

    expect(title.hasAttribute('title')).toBe(false);
  });

  it('uses compact scene cards when no mode has been saved', () => {
    expect(component.sceneCardMode()).toBe('compact');
  });

  it('saves each selected scene card mode', () => {
    component.setSceneCardMode('fit');
    expect(localStorage.getItem(sceneCardModeStorageKey)).toBe('fit');

    component.setSceneCardMode('list');
    expect(localStorage.getItem(sceneCardModeStorageKey)).toBe('list');

    component.setSceneCardMode('compact');
    expect(localStorage.getItem(sceneCardModeStorageKey)).toBe('compact');
  });

  it('restores the saved scene card mode when the outline is recreated', async () => {
    component.setSceneCardMode('list');
    fixture.destroy();

    fixture = TestBed.createComponent(Outline);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sceneCardMode()).toBe('list');
  });

  it('uses compact scene cards when the saved mode is invalid', async () => {
    localStorage.setItem(sceneCardModeStorageKey, 'unsupported');
    fixture.destroy();

    fixture = TestBed.createComponent(Outline);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sceneCardMode()).toBe('compact');
  });

  it('renders a keep-open scene inclusion switch before the separated menu actions', async () => {
    showScene('', 12);

    (fixture.nativeElement.querySelector('.scene-more') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const menu = document.querySelector<HTMLElement>('.scene-options-menu')!;
    const inclusionSwitch = menu.firstElementChild as HTMLButtonElement;

    expect(inclusionSwitch.classList).toContain('outline-inclusion-switch');
    expect(inclusionSwitch.textContent).toContain('Include scene');
    expect(inclusionSwitch.getAttribute('role')).toBe('menuitemcheckbox');
    expect(inclusionSwitch.getAttribute('aria-checked')).toBe('true');
    expect(inclusionSwitch.nextElementSibling?.getAttribute('role')).toBe('separator');

    inclusionSwitch.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('.scene-options-menu')).not.toBeNull();
    expect(inclusionSwitch.getAttribute('aria-checked')).toBe('false');
    expect(component.isOutlineItemIncluded('scene-1')).toBe(false);
    expect(component.isOutlineItemIncluded('scene-2')).toBe(false);

    const sceneMenuTrigger = fixture.debugElement
      .query(By.css('.scene-more'))
      .injector.get(CdkMenuTrigger);
    sceneMenuTrigger.close();
    sceneMenuTrigger.open();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('.outline-inclusion-switch')?.getAttribute('aria-checked')).toBe('false');
  });

  it('disables empty scene, chapter, and act inclusion switches with explanatory tooltips', async () => {
    showScene('   ', 0);

    const menuButtons = [
      {
        trigger: '.act-header-right .btn-more',
        tooltip: 'Write prose or a summary in this act before including it.',
      },
      {
        trigger: '.chapter-row-right .btn-more',
        tooltip: 'Write prose or a summary in this chapter before including it.',
      },
      {
        trigger: '.scene-more',
        tooltip: 'Write prose or a summary in this scene before including it.',
      },
    ];

    for (const menuButton of menuButtons) {
      const trigger = fixture.debugElement.query(By.css(menuButton.trigger));
      trigger.nativeElement.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const inclusionSwitch = document.querySelector<HTMLButtonElement>('.outline-inclusion-switch')!;
      expect(inclusionSwitch.disabled).toBe(true);
      expect(inclusionSwitch.classList).toContain('is-disabled');
      expect(inclusionSwitch.title).toBe(menuButton.tooltip);

      trigger.injector.get(CdkMenuTrigger).close();
    }

    expect(store.setContextInclusion).not.toHaveBeenCalled();
  });

  it('cascades act and chapter inclusion through their scenes', async () => {
    showScene('', 12);
    const actMenuButton = fixture.debugElement.query(By.css('.act-header-right .btn-more'));
    actMenuButton.nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const actSwitch = document.querySelector<HTMLButtonElement>('.outline-inclusion-switch')!;
    expect(actSwitch.textContent).toContain('Include act');
    expect(actSwitch.getAttribute('aria-checked')).toBe('true');
    actSwitch.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.isOutlineItemIncluded('act-1')).toBe(false);

    actMenuButton.injector.get(CdkMenuTrigger).close();
    const chapterMenuButton = fixture.debugElement.query(By.css('.chapter-row-right .btn-more'));
    chapterMenuButton.nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const chapterSwitch = document.querySelector<HTMLButtonElement>('.outline-inclusion-switch')!;
    expect(chapterSwitch.textContent).toContain('Include chapter');
    expect(chapterSwitch.getAttribute('aria-checked')).toBe('false');
    chapterSwitch.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isOutlineItemIncluded('chapter-1')).toBe(true);
    expect(component.isOutlineItemIncluded('act-1')).toBe(true);
  });

  it('distinguishes excluded and empty scenes and their parent branches', () => {
    store.bookHierarchy.set(withEffectiveContextInclusion([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              {
                id: 'scene-1',
                title: 'Excluded Scene',
                summary: 'Excluded summary',
                wordCount: 12,
                includeInContext: false,
              },
            ],
          },
          {
            id: 'chapter-2',
            title: 'Chapter 2',
            scenes: [
              {
                id: 'scene-2',
                title: 'Included Scene',
                summary: 'Included summary',
                wordCount: 12,
                includeInContext: true,
              },
            ],
          },
        ],
      },
      {
        id: 'act-2',
        title: 'Act 2',
        chapters: [
          {
            id: 'chapter-3',
            title: 'Chapter 3',
            scenes: [
              {
                id: 'scene-3',
                title: 'Excluded Scene',
                summary: 'Excluded summary',
                wordCount: 12,
                includeInContext: false,
              },
            ],
          },
        ],
      },
      {
        id: 'act-3',
        title: 'Act 3',
        chapters: [
          {
            id: 'chapter-4',
            title: 'Chapter 4',
            scenes: [
              {
                id: 'scene-4',
                title: 'Empty Scene',
                summary: '',
                wordCount: 0,
                includeInContext: true,
              },
            ],
          },
        ],
      },
    ] as any));
    fixture.detectChanges();

    const actHeaders = fixture.nativeElement.querySelectorAll('.act-header');
    const chapterRows = fixture.nativeElement.querySelectorAll('.chapter-row');
    const sceneRows = fixture.nativeElement.querySelectorAll(
      '.scene-wrapper[data-outline-item-id] > .scene-card-row',
    );

    expect(actHeaders[0].classList).not.toContain('is-context-excluded');
    expect(actHeaders[1].classList).toContain('is-context-excluded');
    expect(actHeaders[2].classList).toContain('is-context-empty');
    expect(chapterRows[0].classList).toContain('is-context-excluded');
    expect(chapterRows[1].classList).not.toContain('is-context-excluded');
    expect(chapterRows[2].classList).toContain('is-context-excluded');
    expect(chapterRows[3].classList).toContain('is-context-empty');
    expect(sceneRows[0].classList).toContain('is-context-excluded');
    expect(sceneRows[1].classList).not.toContain('is-context-excluded');
    expect(sceneRows[2].classList).toContain('is-context-excluded');
    expect(sceneRows[3].classList).toContain('is-context-empty');
    expect(fixture.nativeElement.querySelector('.outline-context-state-badge')).toBeNull();
  });

  it('toggles scene inclusion from the keyboard and resets it with the component', async () => {
    showScene('', 12);
    (fixture.nativeElement.querySelector('.scene-more') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const inclusionSwitch = document.querySelector<HTMLButtonElement>('.outline-inclusion-switch')!;
    inclusionSwitch.focus();
    inclusionSwitch.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
    }));
    inclusionSwitch.dispatchEvent(new KeyboardEvent('keyup', {
      key: ' ',
      code: 'Space',
      bubbles: true,
    }));
    inclusionSwitch.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isOutlineItemIncluded('scene-1')).toBe(false);
    expect(document.querySelector('.scene-options-menu')).not.toBeNull();

    fixture.destroy();
    fixture = TestBed.createComponent(Outline);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isOutlineItemIncluded('scene-1')).toBe(false);
  });

  it('resolves the active Summary and Codex Detection models when the scene AI menu opens', async () => {
    await component.prepareSceneAiMenu();

    expect(systemPromptModelService.resolveActiveModel).toHaveBeenCalledWith('book-1', 'summary');
    expect(systemPromptModelService.resolveActiveModel).toHaveBeenCalledWith(
      'book-1',
      'codexDetection',
    );
    expect(component.summaryModelResolution()).toEqual(readySummaryModel());
    expect(component.codexDetectionModelResolution()).toEqual(readySummaryModel());
  });

  it('disables scene summary generation without prose or an available model', () => {
    showScene('', 0);
    component.summaryModelResolution.set(readySummaryModel());
    expect(component.isSceneSummaryGenerationDisabled('scene-1')).toBe(true);

    showScene('', 12);
    component.summaryModelResolution.set(null);
    expect(component.isSceneSummaryGenerationDisabled('scene-1')).toBe(true);

    component.summaryModelResolution.set(readySummaryModel());
    expect(component.isSceneSummaryGenerationDisabled('scene-1')).toBe(false);
  });

  it('generates and replaces a scene summary from only that scene prose', async () => {
    showScene('Old summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    aiStreamService.streamText.mockResolvedValueOnce('  New generated summary.  ');

    await component.generateSceneSummary('scene-1');

    expect(electronService.invoke).toHaveBeenCalledWith(
      'manuscript:getScenesProse',
      { sceneIds: ['scene-1'] },
    );
    expect(aiStreamService.streamText).toHaveBeenCalledWith({
      streamId: 'outline-scene-summary:scene-1',
      bookId: 'book-1',
      aiPrompt: {
        systemPromptCategory: 'summary',
        prompt: [
          '--- BEGIN SCENE PROSE ---',
          'Scene prose.',
          '--- END SCENE PROSE ---',
        ].join('\n\n'),
        messages: [{
          role: 'user',
          content: [
            '--- BEGIN SCENE PROSE ---',
            'Scene prose.',
            '--- END SCENE PROSE ---',
          ].join('\n\n'),
        }],
      },
      provider: 'openai',
      modelId: 'gpt-5',
    });
    expect(store.updateScene).toHaveBeenCalledWith({
      id: 'scene-1',
      summary: 'New generated summary.',
    });
    expect(component.generatingSummarySceneId()).toBeNull();
  });

  it('removes the model picker from the scene AI submenu', async () => {
    showScene('', 12);

    (fixture.nativeElement.querySelector('.scene-more') as HTMLButtonElement).click();
    fixture.detectChanges();
    const askAiItem = [...document.querySelectorAll<HTMLButtonElement>('.overlay-menu .menu-item')]
      .find(button => button.textContent?.includes('Ask AI'))!;
    askAiItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('.scene-ai-menu')).not.toBeNull();
    expect(document.querySelector('.scene-summary-model-picker')).toBeNull();
  });

  it('opens detected Codex entries from the scene AI submenu', async () => {
    showScene('', 12);
    aiStreamService.streamText.mockResolvedValueOnce(JSON.stringify({
      entries: [
        { name: 'Elara Voss', type: 'character', description: 'A cartographer.' },
        { name: 'The Glass Harbor', type: 'location', description: 'A port.' },
      ],
    }));

    (fixture.nativeElement.querySelector('.scene-more') as HTMLButtonElement).click();
    fixture.detectChanges();
    const askAiItem = [...document.querySelectorAll<HTMLButtonElement>('.overlay-menu .menu-item')]
      .find(button => button.textContent?.includes('Ask AI'))!;
    askAiItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const detectEntriesItem = document.querySelector<HTMLButtonElement>('.detect-codex-entries')!;
    detectEntriesItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('.codex-detection-modal')).not.toBeNull();
    expect(document.querySelector('.codex-detection-modal')?.textContent).toContain('Elara Voss');
    expect(codexService.getEntries).toHaveBeenCalledWith('book-1', { includeArchived: true });
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      aiPrompt: expect.objectContaining({ systemPromptCategory: 'codexDetection' }),
      provider: 'openai',
      modelId: 'gpt-5',
    }));

    document.querySelector<HTMLButtonElement>(
      '.codex-detection-modal [aria-label="Next detected entry"]',
    )?.click();
    fixture.detectChanges();

    expect(document.querySelector('.codex-detection-modal')?.textContent).toContain('The Glass Harbor');

    document.querySelector<HTMLButtonElement>('.codex-detection-modal .close-button')?.click();
  });

  it('rejects an invalid Codex detection response without opening the modal', async () => {
    showScene('', 12);
    component.codexDetectionModelResolution.set(readySummaryModel());
    aiStreamService.streamText.mockResolvedValueOnce('```json\n{"entries":[]}\n```');

    await component.detectCodexEntries('scene-1');

    expect(toastService.error).toHaveBeenCalledWith(
      'AI returned invalid JSON for Codex detection.',
      'Codex Detection',
    );
    expect(component.detectedCodexEntries()).toEqual([]);
    expect(document.querySelector('.codex-detection-modal')).toBeNull();
  });

  it('filters existing Codex names and reports when no new entries remain', async () => {
    showScene('', 12);
    component.codexDetectionModelResolution.set(readySummaryModel());
    codexService.getEntries.mockResolvedValueOnce([codexEntry('Elara Voss', 'Elara')]);
    aiStreamService.streamText.mockResolvedValueOnce(JSON.stringify({
      entries: [
        { name: 'elara', type: 'character', description: 'Already known.' },
      ],
    }));

    await component.detectCodexEntries('scene-1');

    expect(toastService.info).toHaveBeenCalledWith(
      'No new Codex entries were detected.',
      'Codex Detection',
    );
    expect(component.detectedCodexEntries()).toEqual([]);
  });

  it('adds an accepted detection and refreshes Codex state and context', async () => {
    const entry = {
      name: 'The Glass Harbor',
      type: 'location' as const,
      description: 'A storm-battered port.',
    };

    await expect(component.saveDetectedCodexEntry(entry)).resolves.toEqual({ success: true });

    expect(codexService.createEntry).toHaveBeenCalledWith({
      bookId: 'book-1',
      ...entry,
      trackingSetting: 'include_when_detected',
    });
    expect(codexStore.loadEntries).toHaveBeenCalledWith('book-1', 'character', '', {});
    expect(contextTrie.refreshCurrentContext).toHaveBeenCalled();
    expect(toastService.success).not.toHaveBeenCalled();
  });

  it('returns an accepted detection error without showing a toast', async () => {
    const error = new Error('Entry name already exists.');
    codexService.createEntry.mockRejectedValueOnce(error);

    await expect(component.saveDetectedCodexEntry({
      name: 'The Glass Harbor',
      type: 'location',
      description: 'A storm-battered port.',
    })).resolves.toEqual({ success: false, error: error.message });

    expect(toastService.error).not.toHaveBeenCalled();
    expect(codexStore.loadEntries).not.toHaveBeenCalled();
  });

  it('keeps the scene AI submenu open with a loader while generation is active', async () => {
    showScene('', 12);
    const deferred = createDeferred<string>();
    aiStreamService.streamText.mockReturnValueOnce(deferred.promise);

    (fixture.nativeElement.querySelector('.scene-more') as HTMLButtonElement).click();
    fixture.detectChanges();
    const askAiItem = [...document.querySelectorAll<HTMLButtonElement>('.overlay-menu .menu-item')]
      .find(button => button.textContent?.includes('Ask AI'))!;
    askAiItem.click();
    await fixture.whenStable();
    fixture.detectChanges();

    (document.querySelector('.scene-summary-generate') as HTMLButtonElement).click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(document.querySelector('.scene-ai-menu')).not.toBeNull();
    expect(document.querySelector('.scene-summary-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.scene-summary-label-spinner')).not.toBeNull();
    expect(document.querySelector('.scene-summary-generate')?.textContent).toContain('Generating...');
    expect(component.isSceneSummaryGenerationDisabled('scene-1')).toBe(true);

    await component.generateSceneSummary('scene-1');
    expect(electronService.invoke).toHaveBeenCalledTimes(1);

    deferred.resolve('Finished summary');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.generatingSummarySceneId()).toBeNull();
    expect(fixture.nativeElement.querySelector('.scene-summary-label-spinner')).toBeNull();
    expect(document.querySelector('.scene-ai-menu')).toBeNull();
  });

  it('preserves the existing summary when scene prose serializes to empty text', async () => {
    showScene('Keep this summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    electronService.invoke.mockResolvedValueOnce({ 'scene-1': proseDocument('') });

    await component.generateSceneSummary('scene-1');

    expect(aiStreamService.streamText).not.toHaveBeenCalled();
    expect(store.updateScene).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'The scene has no prose to summarize.',
      'Outline',
    );
    expect(component.generatingSummarySceneId()).toBeNull();
  });

  it('reports prose-loading failures without changing the existing summary', async () => {
    showScene('Keep this summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    electronService.invoke.mockRejectedValueOnce(new Error('Could not load prose'));

    await component.generateSceneSummary('scene-1');

    expect(aiStreamService.streamText).not.toHaveBeenCalled();
    expect(store.updateScene).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith('Could not load prose', 'Outline');
    expect(component.generatingSummarySceneId()).toBeNull();
  });

  it('preserves the existing summary when AI returns an empty response', async () => {
    showScene('Keep this summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    aiStreamService.streamText.mockResolvedValueOnce('   ');

    await component.generateSceneSummary('scene-1');

    expect(store.updateScene).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'AI returned an empty scene summary.',
      'Outline',
    );
    expect(component.generatingSummarySceneId()).toBeNull();
  });

  it('preserves the existing summary and avoids duplicate provider toasts when AI fails', async () => {
    showScene('Keep this summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    aiStreamService.streamText.mockRejectedValueOnce(new Error('Provider failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await component.generateSceneSummary('scene-1');

    expect(store.updateScene).not.toHaveBeenCalled();
    expect(toastService.error).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect(component.generatingSummarySceneId()).toBeNull();
    consoleError.mockRestore();
  });

  it('preserves the previous summary and reports persistence failures', async () => {
    showScene('Keep this summary', 12);
    component.summaryModelResolution.set(readySummaryModel());
    store.updateScene.mockRejectedValueOnce(new Error('Could not save summary'));

    await component.generateSceneSummary('scene-1');

    expect(toastService.error).toHaveBeenCalledWith('Could not save summary', 'Outline');
    expect(component.generatingSummarySceneId()).toBeNull();
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

  function showScene(summary: string, wordCount = 0): void {
    store.bookHierarchy.set([
      {
        id: 'act-1',
        title: 'Act 1',
        chapters: [
          {
            id: 'chapter-1',
            title: 'Chapter 1',
            scenes: [
              { id: 'scene-1', title: 'Scene 1', summary, wordCount },
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

function proseDocument(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolver => resolve = resolver);
  return { promise, resolve };
}

function readySummaryModel() {
  return {
    status: 'ready' as const,
    selectorId: 'openai/gpt-5',
    provider: 'openai',
    modelId: 'gpt-5',
  };
}

function codexEntry(name: string, alias: string | null) {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character' as const,
    name,
    alias,
    description: null,
    image: null,
    status: 'archived' as const,
    trackingSetting: 'include_when_detected' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
  };
}
