import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AI_SYSTEM_PROMPTS } from '../../../../../../shared/constants/ai-system-prompts';
import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { SystemPromptSettingsComponent } from './system-prompt-settings.component';

describe('SystemPromptSettingsComponent', () => {
  let fixture: ComponentFixture<SystemPromptSettingsComponent>;
  let component: SystemPromptSettingsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemPromptSettingsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemPromptSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with one protected built-in default for every category', () => {
    const element = fixture.nativeElement as HTMLElement;
    const preset = component.selectedPreset();
    const nameInput = element.querySelector<HTMLInputElement>('#preset-name');
    const promptInput = element.querySelector<HTMLTextAreaElement>('#system-prompt');
    const deleteButton = element.querySelector<HTMLButtonElement>(
      '[aria-label="Delete selected preset"]',
    );

    expect(component.categories.map((category) => category.id)).toEqual([
      'chat',
      'sceneBeat',
      'rephrase',
      'summary',
      'expand',
      'shorten',
    ]);
    expect(component.presets()).toEqual([
      expect.objectContaining({
        id: 'default-assistant',
        category: 'chat',
        systemPrompt: AI_SYSTEM_PROMPTS.chat.default,
      }),
      expect.objectContaining({
        id: 'default-scene-beat',
        category: 'sceneBeat',
        systemPrompt: AI_SYSTEM_PROMPTS.sceneBeat.default,
      }),
      expect.objectContaining({
        id: 'default-rephrase',
        category: 'rephrase',
        systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
      }),
      expect.objectContaining({
        id: 'default-summary',
        category: 'summary',
        systemPrompt: AI_SYSTEM_PROMPTS.summary.default,
      }),
      expect.objectContaining({
        id: 'default-expand',
        category: 'expand',
        systemPrompt: AI_SYSTEM_PROMPTS.expand.default,
      }),
      expect.objectContaining({
        id: 'default-shorten',
        category: 'shorten',
        systemPrompt: AI_SYSTEM_PROMPTS.shorten.default,
      }),
    ]);
    expect(component.filteredPresets()).toHaveLength(1);
    expect(preset).toEqual(
      expect.objectContaining({
        id: 'default-assistant',
        name: 'Default Assistant',
        category: 'chat',
        systemPrompt: AI_SYSTEM_PROMPTS.chat.default,
        temperature: 0.5,
        topP: 1,
        maxOutputTokens: null,
        presencePenalty: 0,
        frequencyPenalty: 0,
        isBuiltIn: true,
      }),
    );
    expect(preset).not.toHaveProperty('reasoningMode');
    expect(nameInput?.disabled).toBe(true);
    expect(promptInput?.disabled).toBe(true);
    expect(deleteButton?.disabled).toBe(true);
  });

  it('filters presets by category and selects the category default', () => {
    const categoryDropdown = fixture.debugElement.query(By.directive(AutocompleteDropdownComponent))
      .componentInstance as AutocompleteDropdownComponent;

    expect(categoryDropdown.options()).toHaveLength(6);
    expect(categoryDropdown.selectedValue()).toBe('chat');
    expect(categoryDropdown.showSearchBar()).toBe(false);
    changeCategory('sceneBeat');

    expect(component.selectedCategory()).toBe('sceneBeat');
    expect(categoryDropdown.selectedValue()).toBe('sceneBeat');
    expect(component.selectedCategoryLabel()).toBe('Scene Beat');
    expect(component.selectedPresetId()).toBe('default-scene-beat');
    expect(component.filteredPresets().map((preset) => preset.id)).toEqual(['default-scene-beat']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.preset-option')).toHaveLength(
      1,
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.preset-name')?.textContent,
    ).toContain('Default Scene Beat');
  });

  it('adds custom presets to the active category and updates them as the user types', () => {
    changeCategory('sceneBeat');
    component.addPreset();
    component.addPreset();
    fixture.detectChanges();

    expect(component.filteredPresets().map((preset) => preset.name)).toEqual([
      'Default Scene Beat',
      'Untitled Preset',
      'Untitled Preset 2',
    ]);
    expect(component.selectedPreset()?.name).toBe('Untitled Preset 2');
    expect(component.selectedPreset()?.category).toBe('sceneBeat');

    updateInput('#preset-name', 'Scene Architect');
    updateInput('#system-prompt', 'Plan each scene around a clear reversal.');

    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        name: 'Scene Architect',
        systemPrompt: 'Plan each scene around a clear reversal.',
      }),
    );
  });

  it('clones a built-in into an editable custom preset in the same category', () => {
    changeCategory('rephrase');
    component.cloneSelectedPreset();
    fixture.detectChanges();

    expect(component.presets()).toHaveLength(7);
    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        name: 'Default Rephrase Copy',
        category: 'rephrase',
        systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
        temperature: 0.5,
        topP: 1,
        isBuiltIn: false,
      }),
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#preset-name')
        ?.disabled,
    ).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('#system-prompt')
        ?.disabled,
    ).toBe(false);

    updateInput('#system-prompt', 'A custom rephrasing prompt.');
    expect(component.selectedPreset()?.systemPrompt).toBe('A custom rephrasing prompt.');
  });

  it('protects built-ins and selects the nearest preset in the active category after deletion', () => {
    changeCategory('summary');
    component.deleteSelectedPreset();
    expect(component.presets()).toHaveLength(6);

    component.addPreset();
    const firstCustomId = component.selectedPresetId();
    component.addPreset();
    const secondCustomId = component.selectedPresetId();

    component.selectPreset(firstCustomId);
    component.deleteSelectedPreset();

    expect(component.presets().map((preset) => preset.id)).toEqual([
      'default-assistant',
      'default-scene-beat',
      'default-rephrase',
      'default-summary',
      'default-expand',
      'default-shorten',
      secondCustomId,
    ]);
    expect(component.selectedPresetId()).toBe(secondCustomId);

    component.deleteSelectedPreset();

    expect(component.presets()).toHaveLength(6);
    expect(component.selectedPresetId()).toBe('default-summary');
    expect(component.selectedCategory()).toBe('summary');
  });

  it('keeps built-in generation settings editable and resets them to their defaults', () => {
    const element = fixture.nativeElement as HTMLElement;
    const advancedToggle = element.querySelector<HTMLButtonElement>('.advanced-toggle');
    const resetButton = element.querySelector<HTMLButtonElement>('.reset-generation-button');

    expect(advancedToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#advanced-generation-settings')).toBeNull();
    expect(element.querySelector('#reasoning-mode')).toBeNull();

    advancedToggle?.click();
    fixture.detectChanges();

    expect(advancedToggle?.getAttribute('aria-expanded')).toBe('true');
    const advancedSettings = element.querySelector<HTMLElement>('#advanced-generation-settings');
    expect(advancedSettings).not.toBeNull();
    expect(advancedSettings?.lastElementChild?.classList.contains('token-field')).toBe(true);

    updateInput('#temperature', '1.2');
    updateInput('#top-p', '0.75');
    updateInput('#max-output-tokens', '2048');
    updateInput('#presence-penalty', '0.4');
    updateInput('#frequency-penalty', '-0.3');

    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        temperature: 1.2,
        topP: 0.75,
        maxOutputTokens: 2048,
        presencePenalty: 0.4,
        frequencyPenalty: -0.3,
      }),
    );

    resetButton?.click();
    fixture.detectChanges();

    expect(component.selectedPreset()).toEqual(
      expect.objectContaining({
        temperature: 0.5,
        topP: 1,
        maxOutputTokens: null,
        presencePenalty: 0,
        frequencyPenalty: 0,
      }),
    );
  });

  function changeCategory(category: string): void {
    const dropdown = fixture.debugElement.query(By.directive(AutocompleteDropdownComponent))
      .componentInstance as AutocompleteDropdownComponent;
    dropdown.selectionChange.emit(category);
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
