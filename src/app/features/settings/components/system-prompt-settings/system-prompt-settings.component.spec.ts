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

  const savedScenePreset = presetDto({
    id: 'scene-custom',
    name: 'Scene Architect',
    category: 'sceneBeat',
    systemPrompt: 'Plan each scene around a clear reversal.',
  });
  const globalPreset = presetDto({
    id: 'global-chat',
    name: 'Global Chat',
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

    await TestBed.configureTestingModule({
      imports: [SystemPromptSettingsComponent],
      providers: [
        {
          provide: SystemPromptService,
          useValue: { listGlobal, listAvailable, create, update, delete: deletePreset },
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
    expect(component.presets()).toHaveLength(9);
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

  it('loads authoritative active IDs and hides the Chat Title category', () => {
    expect(getActivePresetIds).toHaveBeenCalledWith('book-1');
    expect(component.activePresetIds()).toEqual({
      chat: 'default-assistant',
      sceneBeat: 'default-scene-beat',
      rephrase: 'default-rephrase',
      summary: 'default-summary',
      expand: 'default-expand',
      shorten: 'default-shorten',
      title: 'default-title',
    });

    expect(component.categoryOptions.map((option) => option.label)).not.toContain('Chat Title');

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
    expect(element.querySelector<HTMLTextAreaElement>('#system-prompt')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#temperature')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('#top-p')?.disabled).toBe(true);
    expect(element.querySelector<HTMLButtonElement>('.reset-generation-button')?.disabled).toBe(
      true,
    );

    component.resetGenerationSettings();
    expect(component.pendingSaveIds().size).toBe(0);
    expect(update).not.toHaveBeenCalled();
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

    expect(component.presets()).toHaveLength(9);
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
    title: 'default-title',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
