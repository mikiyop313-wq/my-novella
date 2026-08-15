import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_SYSTEM_PROMPTS } from '../../../../../../shared/constants/ai-system-prompts';
import type { SystemPromptPresetDto } from '../../../../../../shared/models/system-prompt.model';
import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { SystemPromptService } from '../../services/system-prompt.service';
import { SystemPromptSettingsComponent } from './system-prompt-settings.component';

describe('SystemPromptSettingsComponent', () => {
  let fixture: ComponentFixture<SystemPromptSettingsComponent>;
  let component: SystemPromptSettingsComponent;
  let listAvailable: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let deletePreset: ReturnType<typeof vi.fn>;
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
    listAvailable = vi.fn().mockResolvedValue([savedScenePreset, globalPreset]);
    create = vi.fn();
    update = vi.fn();
    deletePreset = vi.fn();
    toastError = vi.fn();

    await TestBed.configureTestingModule({
      imports: [SystemPromptSettingsComponent],
      providers: [
        {
          provide: SystemPromptService,
          useValue: { listAvailable, create, update, delete: deletePreset },
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

  it('loads built-ins plus current-book presets and excludes global presets', () => {
    expect(listAvailable).toHaveBeenCalledWith('book-1');
    expect(component.presets()).toHaveLength(7);
    expect(component.presets().map((preset) => preset.id)).not.toContain('global-chat');

    changeCategory('sceneBeat');

    expect(component.filteredPresets().map((preset) => preset.id)).toEqual([
      'default-scene-beat',
      'scene-custom',
    ]);
    expect(component.selectedPresetId()).toBe('default-scene-beat');
  });

  it('starts every category with its built-in default in use', () => {
    expect(component.activePresetIds()).toEqual({
      chat: 'default-assistant',
      sceneBeat: 'default-scene-beat',
      rephrase: 'default-rephrase',
      summary: 'default-summary',
      expand: 'default-expand',
      shorten: 'default-shorten',
    });

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.preset-option.is-in-use .preset-name')?.textContent).toContain(
      'Default Assistant',
    );
    expect(element.querySelector<HTMLButtonElement>('.use-preset-button')?.disabled).toBe(true);
    expect(element.querySelector('.use-preset-button')?.textContent).toContain('In use');
  });

  it('keeps editor selection separate from the visual preset in use', () => {
    selectSavedScenePreset();

    expect(component.selectedPresetId()).toBe('scene-custom');
    expect(component.activePresetIds().sceneBeat).toBe('default-scene-beat');

    const element = fixture.nativeElement as HTMLElement;
    const useButton = element.querySelector<HTMLButtonElement>('.use-preset-button');
    expect(useButton?.disabled).toBe(false);
    expect(useButton?.textContent).toContain('Use preset');

    useButton?.click();
    fixture.detectChanges();

    expect(component.activePresetIds().sceneBeat).toBe('scene-custom');
    expect(element.querySelector('.preset-option.is-in-use .preset-name')?.textContent).toContain(
      'Scene Architect',
    );
    expect(element.querySelector<HTMLButtonElement>('.use-preset-button')?.disabled).toBe(true);
    expect(element.querySelector('.use-preset-button')?.textContent).toContain('In use');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it('keeps a separate visual preset in use for each category', () => {
    selectSavedScenePreset();
    component.useSelectedPreset();

    changeCategory('chat');
    expect(component.activePresetIds().chat).toBe('default-assistant');

    changeCategory('sceneBeat');
    expect(component.activePresetIds().sceneBeat).toBe('scene-custom');
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

  it('creates new and cloned presets with current-book ownership', async () => {
    const created = presetDto({
      id: 'created-preset',
      name: 'Untitled Preset',
      category: 'chat',
      systemPrompt: '',
    });
    create.mockResolvedValueOnce(created);

    await component.addPreset();

    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'Untitled Preset',
        category: 'chat',
        scope: 'book',
        bookId: 'book-1',
      }),
    );
    expect(component.selectedPresetId()).toBe('created-preset');
    expect(component.activePresetIds().chat).toBe('default-assistant');

    changeCategory('rephrase');
    const clone = presetDto({
      id: 'rephrase-copy',
      name: 'Default Rephrase Copy',
      category: 'rephrase',
      systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
    });
    create.mockResolvedValueOnce(clone);

    await component.cloneSelectedPreset();

    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'Default Rephrase Copy',
        category: 'rephrase',
        systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
        scope: 'book',
        bookId: 'book-1',
      }),
    );
    expect(component.selectedPresetId()).toBe('rephrase-copy');
    expect(component.activePresetIds().rephrase).toBe('default-rephrase');
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

    expect(component.presets()).toHaveLength(7);
    expect(toastError).toHaveBeenCalledWith('Create failed', 'Preset creation failed');

    selectSavedScenePreset();
    deletePreset.mockRejectedValueOnce(new Error('Delete failed'));
    await component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).toContain('scene-custom');
    expect(toastError).toHaveBeenCalledWith('Delete failed', 'Preset deletion failed');

    component.useSelectedPreset();
    expect(component.activePresetIds().sceneBeat).toBe('scene-custom');

    deletePreset.mockResolvedValueOnce({ success: true });
    await component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).not.toContain('scene-custom');
    expect(component.selectedPresetId()).toBe('default-scene-beat');
    expect(component.activePresetIds().sceneBeat).toBe('default-scene-beat');
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

  function selectSavedScenePreset(): void {
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

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
