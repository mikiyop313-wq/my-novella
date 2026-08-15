import { Component, computed, signal } from '@angular/core';

import { AI_SYSTEM_PROMPTS } from '../../../../../../shared/constants/ai-system-prompts';
import {
  AutocompleteDropdownComponent,
  type DropdownOption,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';

export type SystemPromptCategory =
  | 'chat'
  | 'sceneBeat'
  | 'rephrase'
  | 'summary'
  | 'expand'
  | 'shorten';

interface SystemPromptPreset {
  id: string;
  name: string;
  category: SystemPromptCategory;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number | null;
  presencePenalty: number;
  frequencyPenalty: number;
  isBuiltIn: boolean;
}

type NumericPresetField = 'temperature' | 'topP' | 'presencePenalty' | 'frequencyPenalty';

interface SystemPromptCategoryDefinition {
  id: SystemPromptCategory;
  label: string;
  defaultPresetId: string;
  defaultPresetName: string;
  systemPrompt: string;
}

const SYSTEM_PROMPT_CATEGORIES: readonly SystemPromptCategoryDefinition[] = [
  {
    id: 'chat',
    label: 'Chat',
    defaultPresetId: 'default-assistant',
    defaultPresetName: 'Default Assistant',
    systemPrompt: AI_SYSTEM_PROMPTS.chat.default,
  },
  {
    id: 'sceneBeat',
    label: 'Scene Beat',
    defaultPresetId: 'default-scene-beat',
    defaultPresetName: 'Default Scene Beat',
    systemPrompt: AI_SYSTEM_PROMPTS.sceneBeat.default,
  },
  {
    id: 'rephrase',
    label: 'Rephrase',
    defaultPresetId: 'default-rephrase',
    defaultPresetName: 'Default Rephrase',
    systemPrompt: AI_SYSTEM_PROMPTS.rephrase.default,
  },
  {
    id: 'summary',
    label: 'Summary',
    defaultPresetId: 'default-summary',
    defaultPresetName: 'Default Summary',
    systemPrompt: AI_SYSTEM_PROMPTS.summary.default,
  },
  {
    id: 'expand',
    label: 'Expand',
    defaultPresetId: 'default-expand',
    defaultPresetName: 'Default Expand',
    systemPrompt: AI_SYSTEM_PROMPTS.expand.default,
  },
  {
    id: 'shorten',
    label: 'Shorten',
    defaultPresetId: 'default-shorten',
    defaultPresetName: 'Default Shorten',
    systemPrompt: AI_SYSTEM_PROMPTS.shorten.default,
  },
] as const;

const DEFAULT_GENERATION_SETTINGS = {
  temperature: 0.5,
  topP: 1,
  maxOutputTokens: null,
  presencePenalty: 0,
  frequencyPenalty: 0,
} as const;

@Component({
  selector: 'app-system-prompt-settings',
  imports: [AutocompleteDropdownComponent],
  templateUrl: './system-prompt-settings.component.html',
  styleUrl: './system-prompt-settings.component.scss',
})
export class SystemPromptSettingsComponent {
  readonly categories = SYSTEM_PROMPT_CATEGORIES;
  readonly categoryOptions: readonly DropdownOption<SystemPromptCategory>[] =
    SYSTEM_PROMPT_CATEGORIES.map((category) => ({
      value: category.id,
      label: category.label,
    }));
  readonly presets = signal<SystemPromptPreset[]>(createBuiltInPresets());
  readonly selectedCategory = signal<SystemPromptCategory>('chat');
  readonly selectedPresetId = signal(defaultPresetIdFor('chat'));
  readonly advancedOpen = signal(false);
  readonly filteredPresets = computed(() =>
    this.presets().filter((preset) => preset.category === this.selectedCategory()),
  );
  readonly selectedCategoryLabel = computed(
    () => categoryDefinitionFor(this.selectedCategory()).label,
  );
  readonly selectedPreset = computed(() =>
    this.filteredPresets().find((preset) => preset.id === this.selectedPresetId()),
  );

  private nextPresetId = 1;

  selectPreset(id: string): void {
    if (this.filteredPresets().some((preset) => preset.id === id)) {
      this.selectedPresetId.set(id);
    }
  }

  changeCategory(value: unknown): void {
    if (typeof value !== 'string' || !isSystemPromptCategory(value)) return;

    this.selectedCategory.set(value);
    this.selectedPresetId.set(defaultPresetIdFor(value));
  }

  addPreset(): void {
    const preset: SystemPromptPreset = {
      id: this.createPresetId(),
      name: this.uniqueName('Untitled Preset'),
      category: this.selectedCategory(),
      systemPrompt: '',
      ...DEFAULT_GENERATION_SETTINGS,
      isBuiltIn: false,
    };

    this.presets.update((presets) => [...presets, preset]);
    this.selectedPresetId.set(preset.id);
  }

  cloneSelectedPreset(): void {
    const selected = this.selectedPreset();
    if (!selected) return;

    const clonedPreset: SystemPromptPreset = {
      ...selected,
      id: this.createPresetId(),
      name: this.uniqueName(`${selected.name.trim() || 'Untitled Preset'} Copy`),
      isBuiltIn: false,
    };

    this.presets.update((presets) => [...presets, clonedPreset]);
    this.selectedPresetId.set(clonedPreset.id);
  }

  deleteSelectedPreset(): void {
    const selected = this.selectedPreset();
    if (!selected || selected.isBuiltIn) return;

    const categoryPresets = this.filteredPresets();
    const selectedIndex = categoryPresets.findIndex((preset) => preset.id === selected.id);
    const remainingPresets = this.presets().filter((preset) => preset.id !== selected.id);
    const remainingCategoryPresets = remainingPresets.filter(
      (preset) => preset.category === selected.category,
    );
    const nextSelection =
      remainingCategoryPresets[Math.min(selectedIndex, remainingCategoryPresets.length - 1)];

    this.presets.set(remainingPresets);
    this.selectedPresetId.set(nextSelection.id);
  }

  toggleAdvancedSettings(): void {
    this.advancedOpen.update((isOpen) => !isOpen);
  }

  resetGenerationSettings(): void {
    this.updateSelectedPreset({ ...DEFAULT_GENERATION_SETTINGS });
  }

  updateName(event: Event): void {
    if (this.selectedPreset()?.isBuiltIn) return;
    this.updateSelectedPreset({ name: this.inputValue(event) });
  }

  updateSystemPrompt(event: Event): void {
    if (this.selectedPreset()?.isBuiltIn) return;
    this.updateSelectedPreset({ systemPrompt: this.inputValue(event) });
  }

  updateNumericField(field: NumericPresetField, event: Event): void {
    const value = Number(this.inputValue(event));
    if (!Number.isFinite(value)) return;

    this.updateSelectedPreset({ [field]: value });
  }

  updateMaxOutputTokens(event: Event): void {
    const rawValue = this.inputValue(event).trim();
    if (!rawValue) {
      this.updateSelectedPreset({ maxOutputTokens: null });
      return;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    this.updateSelectedPreset({ maxOutputTokens: Math.max(1, Math.round(value)) });
  }

  private updateSelectedPreset(update: Partial<SystemPromptPreset>): void {
    const selectedId = this.selectedPresetId();
    this.presets.update((presets) =>
      presets.map((preset) => (preset.id === selectedId ? { ...preset, ...update } : preset)),
    );
  }

  private inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private createPresetId(): string {
    return `prompt-preset-${this.nextPresetId++}`;
  }

  private uniqueName(baseName: string): string {
    const names = new Set(this.presets().map((preset) => preset.name));
    if (!names.has(baseName)) return baseName;

    let suffix = 2;
    while (names.has(`${baseName} ${suffix}`)) {
      suffix++;
    }

    return `${baseName} ${suffix}`;
  }
}

function createBuiltInPresets(): SystemPromptPreset[] {
  return SYSTEM_PROMPT_CATEGORIES.map((category) => ({
    id: category.defaultPresetId,
    name: category.defaultPresetName,
    category: category.id,
    systemPrompt: category.systemPrompt,
    ...DEFAULT_GENERATION_SETTINGS,
    isBuiltIn: true,
  }));
}

function categoryDefinitionFor(category: SystemPromptCategory): SystemPromptCategoryDefinition {
  return SYSTEM_PROMPT_CATEGORIES.find((definition) => definition.id === category)!;
}

function defaultPresetIdFor(category: SystemPromptCategory): string {
  return categoryDefinitionFor(category).defaultPresetId;
}

function isSystemPromptCategory(value: string): value is SystemPromptCategory {
  return SYSTEM_PROMPT_CATEGORIES.some((category) => category.id === value);
}
