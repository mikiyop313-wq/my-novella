import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_SYSTEM_PROMPTS } from '../../../../../../shared/constants/ai-system-prompts';
import type {
  ActiveSystemPromptPresetIds,
  SystemPromptCategory,
  SystemPromptPresetDto,
} from '../../../../../../shared/models/system-prompt.model';
import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { SystemPromptSelectionService } from '../../../../shared/services/system-prompt-selection.service';
import { SystemPromptService } from '../../services/system-prompt.service';
import { SystemPromptSettingsComponent } from './system-prompt-settings.component';
import { AiStore } from '../../../../core/store/ai.store';

describe('SystemPromptSettingsComponent', () => {
  let fixture: ComponentFixture<SystemPromptSettingsComponent>;
  let component: SystemPromptSettingsComponent;
  let listGlobal: ReturnType<typeof vi.fn>;
  let listAvailable: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let deletePreset: ReturnType<typeof vi.fn>;
  let getActivePresetIds: ReturnType<typeof vi.fn>;
  let setActivePreset: ReturnType<typeof vi.fn>;
  let resetActivePreset: ReturnType<typeof vi.fn>;
  let invalidate: ReturnType<typeof vi.fn>;
  let invalidateAll: ReturnType<typeof vi.fn>;
  let toastError: ReturnType<typeof vi.fn>;
  let clipboardWriteText: ReturnType<typeof vi.fn>;
  let getBuiltInDefaultModelId: ReturnType<typeof vi.fn>;
  let setBuiltInDefaultModelId: ReturnType<typeof vi.fn>;

  const savedScenePreset = presetDto({
    id: 'scene-custom',
    name: 'Scene Architect',
    category: 'sceneBeat',
    systemPrompt: 'Plan each scene around a clear reversal.',
  });
  const globalPreset = presetDto({
    id: 'global-chat',
    name: 'Global Chat',
    systemPrompt: 'Write write writer WRITE.',
    category: 'chat',
    scope: 'global',
    bookId: null,
  });

  beforeEach(async () => {
    listGlobal = vi.fn().mockResolvedValue([globalPreset]);
    listAvailable = vi.fn().mockResolvedValue([savedScenePreset, globalPreset]);
    create = vi.fn();
    update = vi.fn();
    deletePreset = vi.fn();
    getActivePresetIds = vi.fn().mockResolvedValue(activeIds());
    setActivePreset = vi
      .fn()
      .mockImplementation((_bookId: string, category: SystemPromptCategory, presetId: string) =>
        Promise.resolve(activeIds({ [category]: presetId })),
      );
    resetActivePreset = vi.fn().mockImplementation(() => Promise.resolve(activeIds()));
    invalidate = vi.fn();
    invalidateAll = vi.fn();
    toastError = vi.fn();
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });
    getBuiltInDefaultModelId = vi.fn().mockResolvedValue('deepseek/deepseek-v4-flash');
    setBuiltInDefaultModelId = vi.fn().mockImplementation(
      (_presetId: string, modelId: string) => Promise.resolve(modelId),
    );

    await TestBed.configureTestingModule({
      imports: [SystemPromptSettingsComponent],
      providers: [
        {
          provide: SystemPromptService,
          useValue: {
            listGlobal,
            listAvailable,
            create,
            update,
            delete: deletePreset,
            getBuiltInDefaultModelId,
            setBuiltInDefaultModelId,
          },
        },
        {
          provide: SystemPromptSelectionService,
          useValue: {
            getActivePresetIds,
            setActivePreset,
            resetActivePreset,
            invalidate,
            invalidateAll,
          },
        },
        { provide: ToastService, useValue: { error: toastError } },
        {
          provide: AiStore,
          useValue: {
            models: () => [],
            modelProviders: () => [],
            isLoading: () => false,
            error: () => null,
            ensureModelsLoaded: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemPromptSettingsComponent);
    fixture.componentRef.setInput('bookId', 'book-1');
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the global library with built-ins and reusable presets', () => {
    expect(listAvailable).toHaveBeenCalledWith('book-1');
    expect(component.selectedScope()).toBe('global');
    expect(component.presets()).toHaveLength(10);
    expect(component.filteredPresets().map((preset) => preset.id)).toEqual([
      'default-assistant',
      'global-chat',
    ]);

    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('input[name="prompt-preset-library"]:checked')?.parentElement
        ?.textContent,
    ).toContain('Global');
    expect(element.querySelector('.preset-option .preset-meta')?.textContent).toContain(
      'Built-in default',
    );
  });

  it('supports a library-only global preset manager without book activation controls', async () => {
    listGlobal.mockClear();
    getActivePresetIds.mockClear();

    const globalFixture = TestBed.createComponent(SystemPromptSettingsComponent);
    globalFixture.componentRef.setInput('globalOnly', true);
    globalFixture.detectChanges();
    await settle();
    globalFixture.detectChanges();

    const globalComponent = globalFixture.componentInstance;
    const element = globalFixture.nativeElement as HTMLElement;
    expect(listGlobal).toHaveBeenCalledOnce();
    expect(getActivePresetIds).not.toHaveBeenCalled();
    expect(globalComponent.filteredPresets().map((preset) => preset.id)).toEqual([
      'default-assistant',
      'global-chat',
    ]);
    expect(element.querySelector('.content-title')?.textContent).toContain('Global Prompts');
    expect(element.querySelector('.scope-selector')).toBeNull();
    expect(element.querySelector('.use-preset-button')).toBeNull();
    expect(element.querySelector('.in-use-badge')).toBeNull();

    const created = presetDto({
      id: 'library-global',
      name: 'Untitled Preset',
      scope: 'global',
      bookId: null,
    });
    create.mockResolvedValueOnce(created);
    await globalComponent.addPreset();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'global' }));
    expect(create.mock.calls.at(-1)?.[0]).not.toHaveProperty('bookId');

    globalFixture.destroy();
  });

  it('switches to current-book presets and keeps built-ins global-only', () => {
    changeScope('book');
    expect(component.selectedPreset()).toBeUndefined();
    expect(component.filteredPresets()).toEqual([]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.preset-empty-state'),
    ).not.toBeNull();

    changeCategory('sceneBeat');

    expect(component.filteredPresets().map((preset) => preset.id)).toEqual(['scene-custom']);
    expect(component.selectedPresetId()).toBe('scene-custom');
    expect(component.filteredPresets().some((preset) => preset.isBuiltIn)).toBe(false);
  });

  it.each(['global', 'book'] as const)(
    'keeps the default first and %s custom presets alphabetical after creation and renaming without losing selection',
    async (scope) => {
      vi.useFakeTimers();
      changeScope(scope);
      const ownership = { scope, bookId: scope === 'global' ? null : 'book-1' };
      const zebra = presetDto({ ...ownership, id: 'zebra', name: 'Zebra' });
      const alpha = presetDto({ ...ownership, id: 'alpha', name: 'alpha' });
      create.mockResolvedValueOnce(zebra).mockResolvedValueOnce(alpha);

      await component.addPreset();
      await component.addPreset();
      fixture.detectChanges();

      const expectedIds = scope === 'global'
        ? ['default-assistant', 'alpha', 'global-chat', 'zebra']
        : ['alpha', 'zebra'];
      expect(component.filteredPresets().map((preset) => preset.id)).toEqual(expectedIds);
      expect(component.selectedPresetId()).toBe('alpha');

      update.mockResolvedValueOnce({ ...alpha, name: 'zz last' });
      updateInput('#preset-name', 'zz last');
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();

      expect(component.filteredPresets().map((preset) => preset.id)).toEqual([
        ...expectedIds.filter((id) => id !== 'alpha'), 'alpha',
      ]);
      expect(component.selectedPresetId()).toBe('alpha');
      expect(component.selectedPreset()?.name).toBe('zz last');
      const renderedNames = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.preset-option .preset-name'),
        (element) => element.textContent?.trim(),
      );
      expect(renderedNames).toEqual(component.filteredPresets().map((preset) => preset.name));
    },
  );

  it('loads authoritative active IDs and hides the Chat Title category', () => {
    expect(getActivePresetIds).toHaveBeenCalledWith('book-1');
    expect(component.activePresetIds()).toEqual({
      chat: 'default-assistant',
      sceneBeat: 'default-scene-beat',
      rephrase: 'default-rephrase',
      summary: 'default-summary',
      expand: 'default-expand',
      shorten: 'default-shorten',
      codexDetection: 'default-codex-detection',
      title: 'default-title',
    });

    expect(component.categoryOptions.map((option) => option.label)).not.toContain('Chat Title');
    expect(component.categoryOptions.map((option) => option.label)).toContain('Codex Detection');

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.preset-option.is-in-use .preset-name')?.textContent).toContain(
      'Default Assistant',
    );
    expect(element.querySelector<HTMLButtonElement>('.use-preset-button')?.disabled).toBe(true);
    expect(element.querySelector('.use-preset-button')?.textContent).toContain('In use');
  });

  it('keeps editor selection separate and activates a custom preset authoritatively', async () => {
    selectSavedScenePreset();

    expect(component.selectedPresetId()).toBe('scene-custom');
    expect(component.activePresetIds()?.sceneBeat).toBe('default-scene-beat');

    const element = fixture.nativeElement as HTMLElement;
    const useButton = element.querySelector<HTMLButtonElement>('.use-preset-button');
    expect(useButton?.disabled).toBe(false);
    expect(useButton?.textContent).toContain('Use preset');

    useButton?.click();
    await settle();
    fixture.detectChanges();

    expect(setActivePreset).toHaveBeenCalledWith('book-1', 'sceneBeat', 'scene-custom');
    expect(component.activePresetIds()?.sceneBeat).toBe('scene-custom');
    expect(element.querySelector('.preset-option.is-in-use .preset-name')?.textContent).toContain(
      'Scene Architect',
    );
    expect(element.querySelector<HTMLButtonElement>('.use-preset-button')?.disabled).toBe(true);
    expect(element.querySelector('.use-preset-button')?.textContent).toContain('In use');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it('keeps a separate visual preset in use for each category', async () => {
    selectSavedScenePreset();
    await component.useSelectedPreset();

    changeCategory('chat');
    expect(component.activePresetIds()?.chat).toBe('default-assistant');

    changeCategory('sceneBeat');
    expect(component.activePresetIds()?.sceneBeat).toBe('scene-custom');
  });

  it('resets built-in activation and retains state when activation fails', async () => {
    selectSavedScenePreset();
    await component.useSelectedPreset();

    changeScope('global');
    await component.useSelectedPreset();

    expect(resetActivePreset).toHaveBeenCalledWith('book-1', 'sceneBeat');
    expect(component.activePresetIds()?.sceneBeat).toBe('default-scene-beat');

    changeScope('book');
    setActivePreset.mockRejectedValueOnce(new Error('Activation unavailable'));
    await component.useSelectedPreset();

    expect(component.activePresetIds()?.sceneBeat).toBe('default-scene-beat');
    expect(toastError).toHaveBeenCalledWith('Activation unavailable', 'Preset activation failed');
  });

  it('disables activation while the selected preset has pending autosave changes', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();
    update.mockResolvedValue(savedScenePreset);

    updateInput('#preset-name', 'Pending name');
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.use-preset-button')
        ?.disabled,
    ).toBe(true);
    await component.useSelectedPreset();
    expect(setActivePreset).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
  });

  it('protects every editable built-in field and requires cloning', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        id: 'default-assistant',
        systemPrompt: AI_SYSTEM_PROMPTS.chat.default,
        isBuiltIn: true,
      }),
    );
    expect(element.querySelector<HTMLInputElement>('#preset-name')?.disabled).toBe(true);
    expect(element.querySelector<HTMLTextAreaElement>('#system-prompt')?.readOnly).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#temperature')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#top-p')?.disabled).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('.reset-generation-button')?.disabled).toBe(
      true,
    );

    component.resetGenerationSettings();
    expect(component.pendingSaveIds().size).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('copies a built-in system prompt from beside the expand action', async () => {
    vi.useFakeTimers();
    const element = fixture.nativeElement as HTMLElement;
    const copyButton = element.querySelector<HTMLButtonElement>(
      '.system-prompt-heading-actions .prompt-copy-button',
    )!;

    expect(copyButton.nextElementSibling?.classList.contains('prompt-expand-button')).toBe(true);
    expect(copyButton.getAttribute('aria-label')).toBe('Copy system prompt');

    copyButton.click();
    await settle();
    fixture.detectChanges();

    expect(clipboardWriteText).toHaveBeenCalledWith(AI_SYSTEM_PROMPTS.chat.default);
    expect(component.promptCopied()).toBe(true);
    expect(copyButton.getAttribute('aria-label')).toBe('System prompt copied');
    expect(element.querySelector('.prompt-copy-status')?.textContent).toContain(
      'System prompt copied to clipboard.',
    );

    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    expect(component.promptCopied()).toBe(false);
  });

  it('copies an editable system prompt from the expanded modal header', async () => {
    selectSavedScenePreset();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();

    const dialog = expandedDialog();
    const copyButton = dialog.querySelector<HTMLButtonElement>(
      '.expanded-prompt-actions .prompt-copy-button',
    )!;
    expect(copyButton).not.toBeNull();

    copyButton.click();
    await settle();

    expect(clipboardWriteText).toHaveBeenCalledWith(savedScenePreset.systemPrompt);
  });

  it('reports clipboard failures', async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error('Clipboard unavailable'));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-copy-button')
      ?.click();
    await settle();

    expect(component.promptCopied()).toBe(false);
    expect(toastError).toHaveBeenCalledWith('Clipboard unavailable', 'Copy failed');
  });

  it('searches the selected prompt with Ctrl+F and selects the active match', async () => {
    component.selectPreset('global-chat');
    fixture.detectChanges();

    const shortcut = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      cancelable: true,
    });
    document.dispatchEvent(shortcut);
    fixture.detectChanges();
    await settle();

    const searchInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-search input',
    );
    expect(shortcut.defaultPrevented).toBe(true);
    expect(searchInput).not.toBeNull();
    expect(document.activeElement).toBe(searchInput);

    searchInput!.value = 'write';
    searchInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await settle();

    const textarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '#system-prompt',
    )!;
    expect(component.searchMatches()).toHaveLength(4);
    expect(component.currentSearchMatch()).toBe(1);
    expect(textarea.selectionStart).toBe(0);
    expect(textarea.selectionEnd).toBe(5);
    expect(document.activeElement).toBe(searchInput);
    const highlight = (fixture.nativeElement as HTMLElement).querySelector(
      '.prompt-search-highlight',
    );
    expect(highlight?.textContent).toBe('Write write writer WRITE.');
    expect(highlight?.querySelectorAll('mark')).toHaveLength(4);
    expect(highlight?.querySelector('mark.is-active')?.textContent).toBe('Write');

    component.selectNextSearchMatch();
    fixture.detectChanges();
    await settle();
    expect(component.currentSearchMatch()).toBe(2);
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(11);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '.prompt-search-highlight mark.is-active',
      )?.textContent,
    ).toBe('write');

    component.selectPreviousSearchMatch();
    component.selectPreviousSearchMatch();
    await settle();
    expect(component.currentSearchMatch()).toBe(4);
    expect(textarea.selectionStart).toBe(19);
    expect(textarea.selectionEnd).toBe(24);
  });

  it('matches the textarea scrollbar width and extends a shorter mirror scroll range', async () => {
    component.selectPreset('global-chat');
    component.openSearch();
    fixture.detectChanges();
    component.updateSearchQuery('write');
    fixture.detectChanges();
    await settle();

    const editor = fixture.nativeElement as HTMLElement;
    const textarea = editor.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const highlight = editor.querySelector<HTMLElement>('.prompt-search-highlight')!;
    textarea.style.borderLeftWidth = '1px';
    textarea.style.borderRightWidth = '1px';
    Object.defineProperties(textarea, {
      offsetWidth: { configurable: true, value: 500 },
      clientWidth: { configurable: true, value: 480 },
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
    });
    Object.defineProperties(highlight, {
      scrollHeight: { configurable: true, value: 580 },
      clientHeight: { configurable: true, value: 200 },
    });

    textarea.scrollTop = 250;
    textarea.scrollLeft = 4;
    component.syncPromptSearchHighlight();
    expect(highlight.style.getPropertyValue('--prompt-textarea-scrollbar-width')).toBe('18px');
    expect(
      highlight.style.getPropertyValue('--prompt-textarea-scroll-height-compensation'),
    ).toBe('20px');
    expect(highlight.scrollTop).toBe(250);
    expect(highlight.scrollLeft).toBe(4);

    textarea.scrollTop = 399.5;
    component.syncPromptSearchHighlight();
    expect(highlight.scrollTop).toBe(399.5);
  });

  it('scrolls only as needed to reveal the active search match and keeps the mirror aligned', async () => {
    component.selectPreset('global-chat');
    component.openSearch();
    fixture.detectChanges();
    component.updateSearchQuery('write');
    fixture.detectChanges();
    await settle();

    const editor = fixture.nativeElement as HTMLElement;
    const searchInput = editor.querySelector<HTMLInputElement>('app-search input')!;
    const textarea = editor.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const highlight = editor.querySelector<HTMLElement>('.prompt-search-highlight')!;
    const marks = [...highlight.querySelectorAll<HTMLElement>('mark')];
    vi.spyOn(highlight, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
    } as DOMRect);
    vi.spyOn(marks[1]!, 'getBoundingClientRect').mockReturnValue({
      top: 320,
      bottom: 340,
    } as DOMRect);
    vi.spyOn(marks[2]!, 'getBoundingClientRect').mockReturnValue({
      top: 180,
      bottom: 200,
    } as DOMRect);

    textarea.scrollTop = 20;
    component.selectNextSearchMatch();
    fixture.detectChanges();
    await settle();
    expect(textarea.scrollTop).toBe(60);
    expect(highlight.scrollTop).toBe(60);
    expect(document.activeElement).toBe(searchInput);

    component.selectNextSearchMatch();
    fixture.detectChanges();
    await settle();
    expect(textarea.scrollTop).toBe(60);

    vi.spyOn(marks[1]!, 'getBoundingClientRect').mockReturnValue({
      top: 70,
      bottom: 90,
    } as DOMRect);
    component.selectPreviousSearchMatch();
    fixture.detectChanges();
    await settle();
    expect(textarea.scrollTop).toBe(30);
    expect(highlight.scrollTop).toBe(30);
    expect(document.activeElement).toBe(searchInput);
  });

  it('scrolls from the first match to the last before the active class rerenders', async () => {
    component.selectPreset('global-chat');
    component.openSearch();
    fixture.detectChanges();
    component.updateSearchQuery('write');
    fixture.detectChanges();
    await settle();

    const editor = fixture.nativeElement as HTMLElement;
    const searchInput = editor.querySelector<HTMLInputElement>('app-search input')!;
    const textarea = editor.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const highlight = editor.querySelector<HTMLElement>('.prompt-search-highlight')!;
    const marks = [...highlight.querySelectorAll<HTMLElement>('mark')];
    vi.spyOn(highlight, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
    } as DOMRect);
    vi.spyOn(marks[3]!, 'getBoundingClientRect').mockReturnValue({
      top: 340,
      bottom: 360,
    } as DOMRect);

    expect(highlight.querySelector('mark.is-active')).toBe(marks[0]);
    textarea.scrollTop = 20;
    component.selectPreviousSearchMatch();
    await settle();

    expect(highlight.querySelector('mark.is-active')).toBe(marks[0]);
    expect(component.currentSearchMatch()).toBe(4);
    expect(textarea.selectionStart).toBe(19);
    expect(textarea.selectionEnd).toBe(24);
    expect(textarea.scrollTop).toBe(80);
    expect(highlight.scrollTop).toBe(80);
    expect(document.activeElement).toBe(searchInput);
  });

  it('applies case and whole-word options and preserves the query across presets', async () => {
    component.selectPreset('global-chat');
    component.openSearch();
    fixture.detectChanges();
    component.updateSearchQuery('write');
    expect(component.searchMatches()).toHaveLength(4);

    component.updateSearchWholeWord(true);
    expect(component.searchMatches()).toHaveLength(3);

    component.updateSearchMatchCase(true);
    expect(component.searchMatches()).toHaveLength(1);

    component.selectPreset('default-assistant');
    fixture.detectChanges();
    await settle();
    expect(component.searchQuery()).toBe('write');
    expect(component.currentSearchMatch()).toBeLessThanOrEqual(1);
  });

  it('closes open search and does not intercept Ctrl+F without a selected prompt', async () => {
    component.openSearch();
    fixture.detectChanges();
    await settle();

    const searchInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'app-search input',
    )!;

    const closeShortcut = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    searchInput.dispatchEvent(closeShortcut);
    fixture.detectChanges();
    await settle();
    expect(closeShortcut.defaultPrevented).toBe(true);
    expect(component.searchOpen()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-search')).toBeNull();

    changeScope('book');
    const browserShortcut = new KeyboardEvent('keydown', {
      key: 'f',
      ctrlKey: true,
      cancelable: true,
    });
    document.dispatchEvent(browserShortcut);
    expect(browserShortcut.defaultPrevented).toBe(false);
    expect(component.searchOpen()).toBe(false);
  });

  it('expands the prompt without losing selection, scrolling, or read-only state', async () => {
    vi.useFakeTimers();
    const inlineTextarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '#system-prompt',
    )!;
    inlineTextarea.setSelectionRange(4, 13);
    inlineTextarea.scrollTop = 28;
    inlineTextarea.scrollLeft = 3;

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    await vi.advanceTimersByTimeAsync(0);

    const dialog = expandedDialog();
    const expandedTextarea = dialog.querySelector<HTMLTextAreaElement>('#expanded-system-prompt')!;
    expect(component.promptExpanded()).toBe(true);
    expect(document.querySelector('.cdk-overlay-container .system-prompt-dialog')).toBe(dialog);
    expect(inlineTextarea.isConnected).toBe(true);
    expect(expandedTextarea.readOnly).toBe(true);
    expect(expandedTextarea.selectionStart).toBe(4);
    expect(expandedTextarea.selectionEnd).toBe(13);
    expect(expandedTextarea.scrollTop).toBe(28);

    expandedTextarea.setSelectionRange(1, 7);
    expandedTextarea.scrollTop = 44;
    expandedTextarea.scrollLeft = 5;
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    expect(component.promptExpanded()).toBe(true);

    dialog.querySelector<HTMLButtonElement>('.expanded-prompt-close')?.click();
    await vi.advanceTimersByTimeAsync(200);
    fixture.detectChanges();
    await settle();
    await vi.runOnlyPendingTimersAsync();

    const restoredTextarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '#system-prompt',
    )!;
    expect(component.promptExpanded()).toBe(false);
    expect(document.querySelector('.cdk-overlay-container .system-prompt-dialog')).toBeNull();
    expect(restoredTextarea.selectionStart).toBe(1);
    expect(restoredTextarea.selectionEnd).toBe(7);
    expect(restoredTextarea.scrollTop).toBe(44);
    expect(document.activeElement).toBe(restoredTextarea);
  });

  it('keeps search matches active in expanded mode and layers Escape correctly', async () => {
    vi.useFakeTimers();
    component.selectPreset('global-chat');
    fixture.detectChanges();
    component.openSearch();
    fixture.detectChanges();
    component.updateSearchQuery('write');
    component.updateSearchWholeWord(true);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    await vi.advanceTimersByTimeAsync(0);

    const dialog = expandedDialog();
    expect(component.searchOpen()).toBe(true);
    expect(dialog.querySelector('.expanded-prompt-find')).toBeNull();
    expect(dialog.querySelector('.expanded-prompt-search .search-widget.is-compact')).not.toBeNull();
    expect(dialog.querySelectorAll('app-search')).toHaveLength(1);
    expect(component.searchQuery()).toBe('write');
    expect(component.searchWholeWord()).toBe(true);
    expect(component.searchMatches()).toHaveLength(3);
    expect(dialog.querySelectorAll('.prompt-search-highlight mark')).toHaveLength(3);

    component.selectNextSearchMatch();
    fixture.detectChanges();
    await settle();
    const expandedTextarea = dialog.querySelector<HTMLTextAreaElement>('#expanded-system-prompt')!;
    expect(component.currentSearchMatch()).toBe(2);
    expect(expandedTextarea.selectionStart).toBe(6);
    expect(expandedTextarea.selectionEnd).toBe(11);

    const searchInput = dialog.querySelector<HTMLInputElement>('app-search input')!;
    const searchEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    searchInput.dispatchEvent(searchEscape);
    fixture.detectChanges();
    await settle();
    expect(component.searchOpen()).toBe(false);
    expect(component.promptExpanded()).toBe(true);
    expect(dialog.querySelector('.expanded-prompt-find')).not.toBeNull();
    expect(dialog.querySelector('app-search')).toBeNull();

    const dialogEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dialog.querySelector<HTMLTextAreaElement>('#expanded-system-prompt')?.dispatchEvent(dialogEscape);
    await vi.advanceTimersByTimeAsync(200);
    fixture.detectChanges();
    await settle();
    expect(dialogEscape.defaultPrevented).toBe(true);
    expect(component.promptExpanded()).toBe(false);
  });

  it('autosaves edits made in expanded mode', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();
    update.mockResolvedValue({
      ...savedScenePreset,
      systemPrompt: 'Expanded editor revision.',
    });

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    const textarea = expandedDialog().querySelector<HTMLTextAreaElement>('#expanded-system-prompt')!;
    textarea.value = 'Expanded editor revision.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saving')?.textContent).toContain(
      'Saving changes shortly…',
    );

    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    expect(update).toHaveBeenCalledWith(
      'scene-custom',
      expect.objectContaining({ systemPrompt: 'Expanded editor revision.' }),
    );
    expect(component.selectedPreset()?.systemPrompt).toBe('Expanded editor revision.');
    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')?.textContent).toContain(
      'Saved',
    );

    textarea.value = 'A newer expanded editor revision.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saving')?.textContent).toContain(
      'Saving changes shortly…',
    );
    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')).toBeNull();
  });

  it('does not show an autosave status for a built-in prompt in expanded mode', async () => {
    vi.useFakeTimers();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    await vi.advanceTimersByTimeAsync(0);

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saving')).toBeNull();
    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')).toBeNull();
  });

  it('does not show saved when an expanded prompt autosave fails', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();
    update.mockRejectedValue(new Error('Database unavailable'));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    const textarea = expandedDialog().querySelector<HTMLTextAreaElement>('#expanded-system-prompt')!;
    textarea.value = 'Unsaved expanded editor revision.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')).toBeNull();
    expect(toastError).toHaveBeenCalledWith('Database unavailable', 'Preset autosave failed');
  });

  it('waits for the latest expanded prompt revision before showing saved', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();

    let finishFirstSave!: (preset: SystemPromptPresetDto) => void;
    update
      .mockImplementationOnce(
        () =>
          new Promise<SystemPromptPresetDto>((resolve) => {
            finishFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...savedScenePreset,
        systemPrompt: 'Second expanded editor revision.',
      });

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.prompt-expand-button')
      ?.click();
    await settle();
    const textarea = expandedDialog().querySelector<HTMLTextAreaElement>('#expanded-system-prompt')!;
    textarea.value = 'First expanded editor revision.';
    textarea.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    textarea.value = 'Second expanded editor revision.';
    textarea.dispatchEvent(new Event('input'));
    finishFirstSave({ ...savedScenePreset, systemPrompt: 'First expanded editor revision.' });
    await settle();
    fixture.detectChanges();

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saving')).not.toBeNull();
    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')).toBeNull();

    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    expect(expandedDialog().querySelector('.expanded-prompt-status.is-saved')?.textContent).toContain(
      'Saved',
    );
  });

  it('shows an editable global model only for action prompt presets', async () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.default-model-field')).toBeNull();

    component.changeCategory('summary');
    fixture.detectChanges();
    expect(element.querySelector('.default-model-field')).not.toBeNull();
    expect(component.selectedPreset()?.defaultModelId).toBe('deepseek/deepseek-v4-flash');

    await component.selectDefaultModel('openai/gpt-5');
    fixture.detectChanges();

    expect(setBuiltInDefaultModelId).toHaveBeenCalledWith('default-summary', 'openai/gpt-5');
    expect(component.selectedPreset()?.defaultModelId).toBe('openai/gpt-5');
    expect(invalidateAll).toHaveBeenCalled();
  });

  it('creates and clones presets with global ownership in the global library', async () => {
    const created = presetDto({
      id: 'created-preset',
      name: 'Untitled Preset',
      category: 'chat',
      systemPrompt: '',
      scope: 'global',
      bookId: null,
    });
    create.mockResolvedValueOnce(created);

    await component.addPreset();

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'Untitled Preset',
        category: 'chat',
        scope: 'global',
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('bookId');
    expect(component.selectedPresetId()).toBe('created-preset');
    expect(component.activePresetIds()?.chat).toBe('default-assistant');

    changeCategory('rephrase');
    const clone = presetDto({
      id: 'rephrase-copy',
      name: 'Default Rephrase Copy',
      category: 'rephrase',
      systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
      scope: 'global',
      bookId: null,
    });
    create.mockResolvedValueOnce(clone);

    await component.cloneSelectedPreset();

    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'Default Rephrase Copy',
        category: 'rephrase',
        systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
        scope: 'global',
        defaultModelId: 'deepseek/deepseek-v4-flash',
      }),
    );
    expect(create.mock.calls[1][0]).not.toHaveProperty('bookId');
    expect(component.selectedPresetId()).toBe('rephrase-copy');
    expect(component.activePresetIds()?.rephrase).toBe('default-rephrase');
  });

  it('creates presets with current-book ownership in the book library', async () => {
    changeScope('book');
    const created = presetDto({ id: 'book-chat', name: 'Untitled Preset' });
    create.mockResolvedValueOnce(created);

    await component.addPreset();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Untitled Preset',
        category: 'chat',
        scope: 'book',
        bookId: 'book-1',
      }),
    );
    expect(component.selectedPresetId()).toBe('book-chat');
  });

  it('combines edits into one autosave after 500 ms', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();
    const updatedPreset = {
      ...savedScenePreset,
      name: 'Scene Designer',
      systemPrompt: 'Build toward a decisive reversal.',
      temperature: 0.8,
      lastEditedAt: '2026-01-03T00:00:00.000Z',
    };
    update.mockResolvedValue(updatedPreset);

    updateInput('#preset-name', 'Scene Designer');
    updateInput('#system-prompt', 'Build toward a decisive reversal.');
    updateInput('#temperature', '0.8');

    await vi.advanceTimersByTimeAsync(499);
    expect(update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'scene-custom',
      expect.objectContaining({
        name: 'Scene Designer',
        systemPrompt: 'Build toward a decisive reversal.',
        temperature: 0.8,
      }),
    );
    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        name: 'Scene Designer',
        systemPrompt: 'Build toward a decisive reversal.',
        temperature: 0.8,
      }),
    );
  });

  it('keeps the active editor focused and queues edits made while autosave is running', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();

    let finishFirstSave!: (preset: SystemPromptPresetDto) => void;
    update
      .mockImplementationOnce(
        () =>
          new Promise<SystemPromptPresetDto>((resolve) => {
            finishFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...savedScenePreset,
        systemPrompt: 'Second edit',
      });

    const textarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '#system-prompt',
    )!;
    textarea.focus();
    updateInput('#system-prompt', 'First edit');

    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    expect(update).toHaveBeenCalledTimes(1);
    expect(textarea.disabled).toBe(false);
    expect(document.activeElement).toBe(textarea);

    updateInput('#system-prompt', 'Second edit');
    finishFirstSave({ ...savedScenePreset, systemPrompt: 'First edit' });
    await settle();
    fixture.detectChanges();

    expect(component.selectedPreset()?.systemPrompt).toBe('Second edit');
    expect(document.activeElement).toBe(textarea);

    await vi.advanceTimersByTimeAsync(500);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenLastCalledWith(
      'scene-custom',
      expect.objectContaining({ systemPrompt: 'Second edit' }),
    );
  });

  it('reverts to the last confirmed preset when autosave fails', async () => {
    vi.useFakeTimers();
    selectSavedScenePreset();
    update.mockRejectedValue(new Error('Database unavailable'));

    updateInput('#preset-name', 'Unsaved Name');
    expect(component.selectedPreset()?.name).toBe('Unsaved Name');

    await vi.advanceTimersByTimeAsync(500);
    fixture.detectChanges();

    expect(component.selectedPreset()?.name).toBe('Scene Architect');
    expect(toastError).toHaveBeenCalledWith('Database unavailable', 'Preset autosave failed');
  });

  it('keeps state consistent when create or delete fails and removes only confirmed deletes', async () => {
    create.mockRejectedValueOnce(new Error('Create failed'));
    await component.addPreset();

    expect(component.presets()).toHaveLength(10);
    expect(toastError).toHaveBeenCalledWith('Create failed', 'Preset creation failed');

    selectSavedScenePreset();
    deletePreset.mockRejectedValueOnce(new Error('Delete failed'));
    await component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).toContain('scene-custom');
    expect(toastError).toHaveBeenCalledWith('Delete failed', 'Preset deletion failed');

    await component.useSelectedPreset();
    expect(component.activePresetIds()?.sceneBeat).toBe('scene-custom');

    deletePreset.mockResolvedValueOnce({ success: true });
    await component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).not.toContain('scene-custom');
    expect(component.selectedPresetId()).toBe('');
    expect(invalidate).toHaveBeenCalledWith('book-1');
    expect(invalidateAll).not.toHaveBeenCalled();
    expect(getActivePresetIds).toHaveBeenLastCalledWith('book-1', true);
    expect(component.activePresetIds()?.sceneBeat).toBe('default-scene-beat');
  });

  it('invalidates every cached book selection after deleting a global preset', async () => {
    component.selectPreset('global-chat');
    deletePreset.mockResolvedValueOnce({ success: true });

    await component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).not.toContain('global-chat');
    expect(component.selectedPresetId()).toBe('default-assistant');
    expect(invalidateAll).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
    expect(getActivePresetIds).toHaveBeenLastCalledWith('book-1', true);
  });

  it('shows a retryable error if active selections cannot refresh after deletion', async () => {
    selectSavedScenePreset();
    deletePreset.mockResolvedValueOnce({ success: true });
    getActivePresetIds.mockRejectedValueOnce(new Error('Selection reload failed'));

    await component.deleteSelectedPreset();
    fixture.detectChanges();

    expect(invalidate).toHaveBeenCalledWith('book-1');
    expect(component.presets().map((preset) => preset.id)).not.toContain('scene-custom');
    expect(component.loadError()).toBe('Selection reload failed');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('Selection reload failed');
    expect(toastError).toHaveBeenCalledWith(
      'Selection reload failed',
      'Preset selection refresh failed',
    );
  });

  it('shows a retryable error instead of temporary presets when loading fails', async () => {
    listAvailable.mockRejectedValueOnce(new Error('Load failed'));

    await component.loadPresets();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(component.loadError()).toBe('Load failed');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Load failed');
    expect(element.querySelector('.prompt-workspace')).toBeNull();

    listAvailable.mockResolvedValueOnce([savedScenePreset]);
    element.querySelector<HTMLButtonElement>('.state-action-button')?.click();
    await settle();
    fixture.detectChanges();

    expect(component.loadError()).toBeNull();
    expect(element.querySelector('.prompt-workspace')).not.toBeNull();
  });

  function changeCategory(category: string): void {
    const dropdown = fixture.debugElement.query(By.directive(AutocompleteDropdownComponent))
      .componentInstance as AutocompleteDropdownComponent;
    dropdown.selectionChange.emit(category);
    fixture.detectChanges();
  }

  function changeScope(scope: 'global' | 'book'): void {
    component.changeScope(scope);
    fixture.detectChanges();
  }

  function selectSavedScenePreset(): void {
    changeScope('book');
    changeCategory('sceneBeat');
    component.selectPreset('scene-custom');
    fixture.detectChanges();
  }

  function updateInput(selector: string, value: string): void {
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(selector);
    if (!input) throw new Error(`Expected input ${selector}`);

    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function expandedDialog(): HTMLElement {
    const dialog = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .system-prompt-dialog',
    );
    if (!dialog) throw new Error('Expected the system prompt dialog');
    return dialog;
  }
});

function presetDto(overrides: Partial<SystemPromptPresetDto> = {}): SystemPromptPresetDto {
  return {
    id: 'preset-1',
    name: 'Custom Preset',
    systemPrompt: 'Write carefully.',
    category: 'chat',
    scope: 'book',
    bookId: 'book-1',
    temperature: 0.5,
    topP: 1,
    maxOutputTokens: null,
    presencePenalty: 0,
    frequencyPenalty: 0,
    defaultModelId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function activeIds(
  overrides: Partial<ActiveSystemPromptPresetIds> = {},
): ActiveSystemPromptPresetIds {
  return {
    chat: 'default-assistant',
    sceneBeat: 'default-scene-beat',
    rephrase: 'default-rephrase',
    summary: 'default-summary',
    expand: 'default-expand',
    shorten: 'default-shorten',
    codexDetection: 'default-codex-detection',
    title: 'default-title',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index++) {
    await Promise.resolve();
  }
}
