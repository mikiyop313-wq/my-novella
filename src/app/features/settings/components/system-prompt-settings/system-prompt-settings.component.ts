import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';

import { BUILT_IN_SYSTEM_PROMPT_PRESETS } from '../../../../../../shared/constants/ai-system-prompts';
import type {
  ActiveSystemPromptPresetIds,
  CreateSystemPromptPresetDto,
  SystemPromptCategory,
  SystemPromptGenerationSettings,
  SystemPromptPresetDto,
  UpdateSystemPromptPresetDto,
} from '../../../../../../shared/models/system-prompt.model';
import {
  AutocompleteDropdownComponent,
  type DropdownOption,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { SystemPromptSelectionService } from '../../../../shared/services/system-prompt-selection.service';
import { SystemPromptService } from '../../services/system-prompt.service';

interface SystemPromptPreset extends SystemPromptGenerationSettings {
  id: string;
  name: string;
  category: SystemPromptCategory;
  systemPrompt: string;
  isBuiltIn: boolean;
}

type NumericPresetField = 'temperature' | 'topP' | 'presencePenalty' | 'frequencyPenalty';

interface SystemPromptCategoryDefinition {
  id: SystemPromptCategory;
  label: string;
}

const SYSTEM_PROMPT_CATEGORY_LABELS: Record<SystemPromptCategory, string> = {
  chat: 'Chat',
  sceneBeat: 'Scene Beat',
  rephrase: 'Rephrase',
  summary: 'Summary',
  expand: 'Expand',
  shorten: 'Shorten',
  title: 'Chat Title',
};

const SYSTEM_PROMPT_CATEGORIES: readonly SystemPromptCategoryDefinition[] = Object.values(
  BUILT_IN_SYSTEM_PROMPT_PRESETS,
)
  .filter((preset) => preset.category !== 'title')
  .map((preset) => ({
    id: preset.category,
    label: SYSTEM_PROMPT_CATEGORY_LABELS[preset.category],
  }));

const AUTOSAVE_DELAY_MS = 500;

@Component({
  selector: 'app-system-prompt-settings',
  imports: [AutocompleteDropdownComponent],
  templateUrl: './system-prompt-settings.component.html',
  styleUrl: './system-prompt-settings.component.scss',
})
export class SystemPromptSettingsComponent implements OnInit, OnDestroy {
  readonly bookId = input.required<string>();

  private readonly systemPromptService = inject(SystemPromptService);
  private readonly systemPromptSelectionService = inject(SystemPromptSelectionService);
  private readonly toastService = inject(ToastService);
  private readonly confirmedPresets = new Map<string, SystemPromptPreset>();
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly presetRevisions = new Map<string, number>();

  readonly categories = SYSTEM_PROMPT_CATEGORIES;
  readonly categoryOptions: readonly DropdownOption<SystemPromptCategory>[] =
    SYSTEM_PROMPT_CATEGORIES.map((category) => ({
      value: category.id,
      label: category.label,
    }));
  readonly presets = signal<SystemPromptPreset[]>(createBuiltInPresets());
  readonly selectedCategory = signal<SystemPromptCategory>('chat');
  readonly selectedPresetId = signal(defaultPresetIdFor('chat'));
  readonly activePresetIds = signal<Readonly<ActiveSystemPromptPresetIds> | null>(null);
  readonly advancedOpen = signal(false);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly activatingPresetId = signal<string | null>(null);
  readonly deletingPresetId = signal<string | null>(null);
  readonly pendingSaveIds = signal<ReadonlySet<string>>(new Set());
  readonly savingPresetIds = signal<ReadonlySet<string>>(new Set());
  readonly filteredPresets = computed(() =>
    this.presets().filter((preset) => preset.category === this.selectedCategory()),
  );
  readonly selectedCategoryLabel = computed(
    () => categoryDefinitionFor(this.selectedCategory()).label,
  );
  readonly selectedPreset = computed(() =>
    this.filteredPresets().find((preset) => preset.id === this.selectedPresetId()),
  );

  ngOnInit(): void {
    void this.loadPresets();
  }

  ngOnDestroy(): void {
    for (const [presetId, timer] of this.saveTimers) {
      clearTimeout(timer);
      void this.savePreset(presetId);
    }
    this.saveTimers.clear();
  }

  async loadPresets(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const [available, activePresetIds] = await Promise.all([
        this.systemPromptService.listAvailable(this.bookId()),
        this.systemPromptSelectionService.getActivePresetIds(this.bookId()),
      ]);
      const bookPresets = available
        .filter((preset) => preset.scope === 'book' && preset.bookId === this.bookId())
        .map(mapDtoToPreset);

      this.confirmedPresets.clear();
      for (const preset of bookPresets) {
        this.confirmedPresets.set(preset.id, preset);
      }
      this.presets.set([...createBuiltInPresets(), ...bookPresets]);
      this.activePresetIds.set(activePresetIds);
      this.ensureValidSelection();
    } catch (error) {
      this.loadError.set(errorMessage(error, 'Unable to load system prompt presets.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  selectPreset(id: string): void {
    if (this.filteredPresets().some((preset) => preset.id === id)) {
      this.selectedPresetId.set(id);
    }
  }

  async useSelectedPreset(): Promise<void> {
    const selected = this.selectedPreset();
    if (
      !selected ||
      this.isPresetInUse(selected.id, selected.category) ||
      this.activatingPresetId() !== null ||
      this.isPresetPendingOrSaving(selected.id) ||
      this.isCreating() ||
      this.deletingPresetId() !== null
    ) {
      return;
    }

    this.activatingPresetId.set(selected.id);
    try {
      const activePresetIds = selected.isBuiltIn
        ? await this.systemPromptSelectionService.resetActivePreset(
            this.bookId(),
            selected.category,
          )
        : await this.systemPromptSelectionService.setActivePreset(
            this.bookId(),
            selected.category,
            selected.id,
          );
      this.activePresetIds.set(activePresetIds);
    } catch (error) {
      this.showError(error, 'Unable to activate this preset.', 'Preset activation failed');
    } finally {
      this.activatingPresetId.set(null);
    }
  }

  isPresetInUse(id: string, category: SystemPromptCategory): boolean {
    return this.activePresetIds()?.[category] === id;
  }

  changeCategory(value: unknown): void {
    if (typeof value !== 'string' || !isSystemPromptCategory(value)) return;

    this.selectedCategory.set(value);
    this.selectedPresetId.set(defaultPresetIdFor(value));
  }

  async addPreset(): Promise<void> {
    if (
      this.isCreating() ||
      this.deletingPresetId() !== null ||
      this.activatingPresetId() !== null
    ) {
      return;
    }

    const category = this.selectedCategory();

    const data: CreateSystemPromptPresetDto = {
      name: this.uniqueName('Untitled Preset'),
      category,
      systemPrompt: '',
      scope: 'book',
      bookId: this.bookId(),
      ...generationSettingsFor(category),
    };

    this.isCreating.set(true);
    try {
      const created = mapDtoToPreset(await this.systemPromptService.create(data));
      this.confirmedPresets.set(created.id, created);
      this.presets.update((presets) => [...presets, created]);
      this.selectedPresetId.set(created.id);
    } catch (error) {
      this.showError(error, 'Unable to create this preset.', 'Preset creation failed');
    } finally {
      this.isCreating.set(false);
    }
  }

  async cloneSelectedPreset(): Promise<void> {
    const selected = this.selectedPreset();
    if (
      !selected ||
      this.isCreating() ||
      this.deletingPresetId() !== null ||
      this.activatingPresetId() !== null ||
      this.isPresetPendingOrSaving(selected.id)
    ) {
      return;
    }

    const data: CreateSystemPromptPresetDto = {
      name: this.uniqueName(`${selected.name.trim() || 'Untitled Preset'} Copy`),
      category: selected.category,
      systemPrompt: selected.systemPrompt,
      scope: 'book',
      bookId: this.bookId(),
      temperature: selected.temperature,
      topP: selected.topP,
      maxOutputTokens: selected.maxOutputTokens,
      presencePenalty: selected.presencePenalty,
      frequencyPenalty: selected.frequencyPenalty,
    };

    this.isCreating.set(true);
    try {
      const created = mapDtoToPreset(await this.systemPromptService.create(data));
      this.confirmedPresets.set(created.id, created);
      this.presets.update((presets) => [...presets, created]);
      this.selectedPresetId.set(created.id);
    } catch (error) {
      this.showError(error, 'Unable to clone this preset.', 'Preset cloning failed');
    } finally {
      this.isCreating.set(false);
    }
  }

  async deleteSelectedPreset(): Promise<void> {
    const selected = this.selectedPreset();
    if (
      !selected ||
      selected.isBuiltIn ||
      this.isCreating() ||
      this.deletingPresetId() !== null ||
      this.activatingPresetId() !== null ||
      this.isPresetPendingOrSaving(selected.id)
    ) {
      return;
    }

    this.deletingPresetId.set(selected.id);
    try {
      const result = await this.systemPromptService.delete(selected.id);
      if (!result.success) throw new Error('The preset no longer exists.');

      const categoryPresets = this.filteredPresets();
      const selectedIndex = categoryPresets.findIndex((preset) => preset.id === selected.id);
      const remainingPresets = this.presets().filter((preset) => preset.id !== selected.id);
      const remainingCategoryPresets = remainingPresets.filter(
        (preset) => preset.category === selected.category,
      );
      const nextSelection =
        remainingCategoryPresets[Math.min(selectedIndex, remainingCategoryPresets.length - 1)];

      this.confirmedPresets.delete(selected.id);
      this.presets.set(remainingPresets);
      this.selectedPresetId.set(nextSelection.id);
    } catch (error) {
      this.showError(error, 'Unable to delete this preset.', 'Preset deletion failed');
      this.deletingPresetId.set(null);
      return;
    }

    this.systemPromptSelectionService.invalidate(this.bookId());
    try {
      this.activePresetIds.set(
        await this.systemPromptSelectionService.getActivePresetIds(this.bookId(), true),
      );
    } catch (error) {
      const message = errorMessage(error, 'Unable to refresh the active system prompt preset.');
      this.loadError.set(message);
      this.showError(error, message, 'Preset selection refresh failed');
    } finally {
      this.deletingPresetId.set(null);
    }
  }

  toggleAdvancedSettings(): void {
    this.advancedOpen.update((isOpen) => !isOpen);
  }

  resetGenerationSettings(): void {
    const selected = this.selectedPreset();
    if (!selected) return;

    this.updateSelectedPreset(generationSettingsFor(selected.category));
  }

  updateName(event: Event): void {
    this.updateSelectedPreset({ name: this.inputValue(event) });
  }

  updateSystemPrompt(event: Event): void {
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

  isPresetPendingOrSaving(id: string): boolean {
    return this.pendingSaveIds().has(id) || this.savingPresetIds().has(id);
  }

  private updateSelectedPreset(update: Partial<SystemPromptPreset>): void {
    const selected = this.selectedPreset();
    if (!selected || selected.isBuiltIn) return;

    this.presets.update((presets) =>
      presets.map((preset) => (preset.id === selected.id ? { ...preset, ...update } : preset)),
    );
    this.presetRevisions.set(selected.id, (this.presetRevisions.get(selected.id) ?? 0) + 1);
    this.scheduleSave(selected.id);
  }

  private scheduleSave(presetId: string): void {
    const existingTimer = this.saveTimers.get(presetId);
    if (existingTimer) clearTimeout(existingTimer);

    this.updateIdSet(this.pendingSaveIds, presetId, true);
    const timer = setTimeout(() => {
      this.saveTimers.delete(presetId);
      this.updateIdSet(this.pendingSaveIds, presetId, false);
      void this.savePreset(presetId);
    }, AUTOSAVE_DELAY_MS);
    this.saveTimers.set(presetId, timer);
  }

  private async savePreset(presetId: string): Promise<void> {
    const preset = this.presets().find((candidate) => candidate.id === presetId);
    if (!preset || preset.isBuiltIn) return;
    if (this.savingPresetIds().has(presetId)) {
      this.scheduleSave(presetId);
      return;
    }

    const revision = this.presetRevisions.get(presetId) ?? 0;
    this.updateIdSet(this.pendingSaveIds, presetId, false);
    this.updateIdSet(this.savingPresetIds, presetId, true);
    try {
      const updated = await this.systemPromptService.update(presetId, updateDtoFor(preset));
      if (!updated) throw new Error('The preset no longer exists.');

      const confirmed = mapDtoToPreset(updated);
      this.confirmedPresets.set(presetId, confirmed);
      if ((this.presetRevisions.get(presetId) ?? 0) === revision) {
        this.replacePreset(confirmed);
      }
    } catch (error) {
      const confirmed = this.confirmedPresets.get(presetId);
      if (confirmed && (this.presetRevisions.get(presetId) ?? 0) === revision) {
        this.replacePreset(confirmed);
      }
      this.showError(error, 'Your latest changes were reverted.', 'Preset autosave failed');
    } finally {
      this.updateIdSet(this.savingPresetIds, presetId, false);
    }
  }

  private replacePreset(replacement: SystemPromptPreset): void {
    this.presets.update((presets) =>
      presets.map((preset) => (preset.id === replacement.id ? replacement : preset)),
    );
  }

  private updateIdSet(
    target: { update(updater: (value: ReadonlySet<string>) => ReadonlySet<string>): void },
    id: string,
    add: boolean,
  ): void {
    target.update((ids) => {
      const next = new Set(ids);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private ensureValidSelection(): void {
    const selectedExists = this.presets().some(
      (preset) =>
        preset.category === this.selectedCategory() && preset.id === this.selectedPresetId(),
    );
    if (!selectedExists) {
      this.selectedPresetId.set(defaultPresetIdFor(this.selectedCategory()));
    }
  }

  private inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
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

  private showError(error: unknown, fallback: string, title: string): void {
    this.toastService.error(errorMessage(error, fallback), title);
  }
}

function createBuiltInPresets(): SystemPromptPreset[] {
  return Object.values(BUILT_IN_SYSTEM_PROMPT_PRESETS).map((preset) => ({
    ...preset,
    isBuiltIn: true,
  }));
}

function generationSettingsFor(category: SystemPromptCategory): SystemPromptGenerationSettings {
  const preset = BUILT_IN_SYSTEM_PROMPT_PRESETS[category];
  return {
    temperature: preset.temperature,
    topP: preset.topP,
    maxOutputTokens: preset.maxOutputTokens,
    presencePenalty: preset.presencePenalty,
    frequencyPenalty: preset.frequencyPenalty,
  };
}

function mapDtoToPreset(preset: SystemPromptPresetDto): SystemPromptPreset {
  return {
    id: preset.id,
    name: preset.name,
    category: preset.category,
    systemPrompt: preset.systemPrompt,
    temperature: preset.temperature,
    topP: preset.topP,
    maxOutputTokens: preset.maxOutputTokens,
    presencePenalty: preset.presencePenalty,
    frequencyPenalty: preset.frequencyPenalty,
    isBuiltIn: false,
  };
}

function updateDtoFor(preset: SystemPromptPreset): UpdateSystemPromptPresetDto {
  return {
    name: preset.name,
    systemPrompt: preset.systemPrompt,
    temperature: preset.temperature,
    topP: preset.topP,
    maxOutputTokens: preset.maxOutputTokens,
    presencePenalty: preset.presencePenalty,
    frequencyPenalty: preset.frequencyPenalty,
  };
}

function categoryDefinitionFor(category: SystemPromptCategory): SystemPromptCategoryDefinition {
  return SYSTEM_PROMPT_CATEGORIES.find((definition) => definition.id === category)!;
}

function defaultPresetIdFor(category: SystemPromptCategory): string {
  return BUILT_IN_SYSTEM_PROMPT_PRESETS[category].id;
}

function isSystemPromptCategory(value: string): value is SystemPromptCategory {
  return SYSTEM_PROMPT_CATEGORIES.some((category) => category.id === value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
