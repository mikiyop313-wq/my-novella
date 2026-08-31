import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';

import {
  BUILT_IN_SYSTEM_PROMPT_PRESETS,
  DEFAULT_ACTION_MODEL_ID,
  categoryUsesDefaultModel,
} from '../../../../../../shared/constants/ai-system-prompts';
import type {
  ActiveSystemPromptPresetIds,
  CreateSystemPromptPresetDto,
  SystemPromptCategory,
  SystemPromptGenerationSettings,
  SystemPromptOwnership,
  SystemPromptPresetDto,
  SystemPromptScope,
  UpdateSystemPromptPresetDto,
} from '../../../../../../shared/models/system-prompt.model';
import {
  AutocompleteDropdownComponent,
  type DropdownOption,
} from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { SearchComponent } from '../../../../shared/components/search/search.component';
import { OverlayModalDirective } from '../../../../shared/directives/overlay-modal.directive';
import { ToastService } from '../../../../shared/services/toast.service';
import { SystemPromptSelectionService } from '../../../../shared/services/system-prompt-selection.service';
import {
  findTextMatches,
  type TextSearchMatch,
} from '../../../../shared/utils/text-search.utils';
import { SystemPromptService } from '../../services/system-prompt.service';
import { AiStore } from '../../../../core/store/ai.store';
import { buildModelDropdownSections } from '../../../manuscript/components/ai-prompt/ai-prompt-dropdown-options';

interface SystemPromptPreset extends SystemPromptGenerationSettings {
  id: string;
  name: string;
  category: SystemPromptCategory;
  systemPrompt: string;
  scope: SystemPromptScope;
  bookId: string | null;
  isBuiltIn: boolean;
  defaultModelId: string | null;
}

type NumericPresetField = 'temperature' | 'topP' | 'presencePenalty' | 'frequencyPenalty';

interface SystemPromptCategoryDefinition {
  id: SystemPromptCategory;
  label: string;
}

interface PromptSearchHighlightSegment {
  text: string;
  isMatch: boolean;
  isActive: boolean;
}

interface PromptEditorViewState {
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
}

const SYSTEM_PROMPT_CATEGORY_LABELS: Record<SystemPromptCategory, string> = {
  chat: 'Chat',
  sceneBeat: 'Prose Generation',
  rephrase: 'Rephrase',
  summary: 'Summary',
  expand: 'Expand',
  shorten: 'Shorten',
  codexDetection: 'Codex Detection',
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
const COPY_CONFIRMATION_DURATION_MS = 2000;

@Component({
  selector: 'app-system-prompt-settings',
  imports: [
    A11yModule,
    AutocompleteDropdownComponent,
    NgTemplateOutlet,
    OverlayModalDirective,
    SearchComponent,
  ],
  templateUrl: './system-prompt-settings.component.html',
  styleUrl: './system-prompt-settings.component.scss',
})
export class SystemPromptSettingsComponent implements OnInit, OnDestroy {
  @ViewChild(SearchComponent) private searchWidget?: SearchComponent;
  @ViewChildren('systemPromptTextarea')
  private systemPromptTextareas?: QueryList<ElementRef<HTMLTextAreaElement>>;
  @ViewChild('systemPromptModalTrigger') private systemPromptModalTrigger?: OverlayModalDirective;

  readonly bookId = input<string>();
  readonly globalOnly = input(false);

  private readonly systemPromptService = inject(SystemPromptService);
  private readonly systemPromptSelectionService = inject(SystemPromptSelectionService);
  private readonly toastService = inject(ToastService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  readonly aiStore = inject(AiStore);
  private readonly confirmedPresets = new Map<string, SystemPromptPreset>();
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly presetRevisions = new Map<string, number>();
  private pendingPromptEditorState: PromptEditorViewState | null = null;
  private copyConfirmationTimer: ReturnType<typeof setTimeout> | null = null;

  readonly categories = SYSTEM_PROMPT_CATEGORIES;
  readonly modelDropdownSections = computed(() => buildModelDropdownSections({
    providers: this.aiStore.modelProviders(),
    loading: this.aiStore.isLoading(),
    error: this.aiStore.error(),
  }));
  readonly categoryOptions: readonly DropdownOption<SystemPromptCategory>[] =
    SYSTEM_PROMPT_CATEGORIES.map((category) => ({
      value: category.id,
      label: category.label,
    }));
  readonly presets = signal<SystemPromptPreset[]>(createBuiltInPresets());
  readonly selectedScope = signal<SystemPromptScope>('global');
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
  readonly searchOpen = signal(false);
  readonly searchQuery = signal('');
  readonly searchMatchCase = signal(false);
  readonly searchWholeWord = signal(false);
  readonly activeSearchMatchIndex = signal(-1);
  readonly promptExpanded = signal(false);
  readonly promptCopied = signal(false);
  readonly filteredPresets = computed(() =>
    this.presets().filter(
      (preset) =>
        preset.category === this.selectedCategory() &&
        preset.scope === this.selectedScope() &&
        (preset.scope === 'global' || preset.bookId === this.bookId()),
    ),
  );
  readonly selectedScopeLabel = computed(() =>
    this.selectedScope() === 'global' ? 'Global' : 'Book',
  );
  readonly selectedCategoryLabel = computed(
    () => categoryDefinitionFor(this.selectedCategory()).label,
  );
  readonly selectedPreset = computed(() =>
    this.filteredPresets().find((preset) => preset.id === this.selectedPresetId()),
  );
  readonly searchMatches = computed<readonly TextSearchMatch[]>(() =>
    findTextMatches(this.selectedPreset()?.systemPrompt ?? '', {
      query: this.searchQuery(),
      matchCase: this.searchMatchCase(),
      wholeWord: this.searchWholeWord(),
    }),
  );
  readonly currentSearchMatch = computed(() => {
    const index = this.activeSearchMatchIndex();
    return index >= 0 && index < this.searchMatches().length ? index + 1 : 0;
  });
  readonly searchHighlightSegments = computed<readonly PromptSearchHighlightSegment[]>(() => {
    const prompt = this.selectedPreset()?.systemPrompt ?? '';
    const matches = this.searchOpen() ? this.searchMatches() : [];
    if (matches.length === 0) return [];

    const activeIndex = this.activeSearchMatchIndex();
    const segments: PromptSearchHighlightSegment[] = [];
    let offset = 0;

    matches.forEach((match, index) => {
      if (match.from > offset) {
        segments.push({
          text: prompt.slice(offset, match.from),
          isMatch: false,
          isActive: false,
        });
      }

      segments.push({
        text: prompt.slice(match.from, match.to),
        isMatch: true,
        isActive: index === activeIndex,
      });
      offset = match.to;
    });

    if (offset < prompt.length) {
      segments.push({
        text: prompt.slice(offset),
        isMatch: false,
        isActive: false,
      });
    }

    return segments;
  });

  ngOnInit(): void {
    void this.aiStore.ensureModelsLoaded();
    void this.loadPresets();
  }

  ngOnDestroy(): void {
    if (this.copyConfirmationTimer) clearTimeout(this.copyConfirmationTimer);

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
      const bookId = this.bookId();
      if (!this.globalOnly() && !bookId) {
        throw new Error('A book is required to load book prompt presets.');
      }

      const [available, activePresetIds, builtInPresets] = this.globalOnly()
        ? [
            await this.systemPromptService.listGlobal(),
            null,
            await this.loadBuiltInPresets(),
          ]
        : await Promise.all([
            this.systemPromptService.listAvailable(bookId!),
            this.systemPromptSelectionService.getActivePresetIds(bookId!),
            this.loadBuiltInPresets(),
          ]);
      const savedPresets = available.map(mapDtoToPreset);

      this.confirmedPresets.clear();
      for (const preset of savedPresets) {
        this.confirmedPresets.set(preset.id, preset);
      }
      this.presets.set([...builtInPresets, ...savedPresets]);
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
      this.refreshSearchForSelectedPreset();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleSearchShortcut(event: KeyboardEvent): void {
    if (
      event.key.toLocaleLowerCase() !== 'f' ||
      (!event.ctrlKey && !event.metaKey) ||
      event.altKey ||
      !this.selectedPreset() ||
      !this.activePromptTextarea()
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (this.searchOpen()) {
      this.closeSearch();
      return;
    }

    this.openSearch();
  }

  openSearch(): void {
    if (!this.selectedPreset() || !this.activePromptTextarea()) return;

    this.searchOpen.set(true);
    this.refreshSearch({ resetActiveMatch: false, selectActiveMatch: false });
    queueMicrotask(() => this.searchWidget?.focusInput());
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQuery.set('');
    this.searchMatchCase.set(false);
    this.searchWholeWord.set(false);
    this.activeSearchMatchIndex.set(-1);
    queueMicrotask(() => this.activePromptTextarea()?.focus());
  }

  openExpandedPrompt(): void {
    if (this.promptExpanded() || !this.selectedPreset() || !this.activePromptTextarea()) return;

    if (!this.systemPromptModalTrigger) return;

    const editorState = this.capturePromptEditorState();
    this.promptExpanded.set(true);
    this.changeDetectorRef.detectChanges();
    this.systemPromptModalTrigger.openModal();
    this.restorePromptEditorState(editorState);
  }

  closeExpandedPrompt(): void {
    if (!this.promptExpanded()) return;

    if (!this.systemPromptModalTrigger) return;

    this.pendingPromptEditorState = this.capturePromptEditorState();
    this.systemPromptModalTrigger.closeModal();
  }

  handleExpandedPromptClosed(): void {
    const editorState = this.pendingPromptEditorState;
    this.pendingPromptEditorState = null;
    this.promptExpanded.set(false);
    this.changeDetectorRef.detectChanges();
    if (editorState) this.restorePromptEditorState(editorState);
  }

  handleExpandedPromptKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    if (this.searchOpen()) {
      this.closeSearch();
      return;
    }

    this.closeExpandedPrompt();
  }

  stopSearchEscape(event: Event): void {
    event.stopPropagation();
  }

  updateSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.refreshSearch({ resetActiveMatch: true, selectActiveMatch: true });
  }

  updateSearchMatchCase(matchCase: boolean): void {
    this.searchMatchCase.set(matchCase);
    this.refreshSearch({ resetActiveMatch: true, selectActiveMatch: true });
  }

  updateSearchWholeWord(wholeWord: boolean): void {
    this.searchWholeWord.set(wholeWord);
    this.refreshSearch({ resetActiveMatch: true, selectActiveMatch: true });
  }

  selectPreviousSearchMatch(): void {
    this.selectSearchMatch(-1);
  }

  selectNextSearchMatch(): void {
    this.selectSearchMatch(1);
  }

  syncPromptSearchHighlight(event?: Event): void {
    const textarea = event?.target instanceof HTMLTextAreaElement
      ? event.target
      : this.activePromptTextarea();
    const highlight = textarea
      ?.closest('.prompt-textarea-shell')
      ?.querySelector<HTMLElement>('.prompt-search-highlight');
    if (!textarea || !highlight) return;

    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }

  async useSelectedPreset(): Promise<void> {
    const selected = this.selectedPreset();
    if (
      this.globalOnly() ||
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
            this.requiredBookId(),
            selected.category,
          )
        : await this.systemPromptSelectionService.setActivePreset(
            this.requiredBookId(),
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

  changeScope(scope: SystemPromptScope): void {
    if (
      this.globalOnly() ||
      (scope !== 'global' && scope !== 'book') ||
      scope === this.selectedScope() ||
      this.isCreating() ||
      this.deletingPresetId() !== null ||
      this.activatingPresetId() !== null
    ) {
      return;
    }

    this.selectedScope.set(scope);
    this.selectDefaultForCurrentView();
  }

  changeCategory(value: unknown): void {
    if (typeof value !== 'string' || !isSystemPromptCategory(value)) return;

    this.selectedCategory.set(value);
    this.selectDefaultForCurrentView();
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
    const scope = this.selectedScope();

    const data: CreateSystemPromptPresetDto = {
      name: this.uniqueName('Untitled Preset', scope),
      category,
      systemPrompt: '',
      ...ownershipFor(scope, this.bookId()),
      ...generationSettingsFor(category),
      defaultModelId: categoryUsesDefaultModel(category) ? DEFAULT_ACTION_MODEL_ID : null,
    };

    this.isCreating.set(true);
    try {
      const created = mapDtoToPreset(await this.systemPromptService.create(data));
      this.confirmedPresets.set(created.id, created);
      this.presets.update((presets) => [...presets, created]);
      if (this.selectedScope() === scope && this.selectedCategory() === category) {
        this.selectedPresetId.set(created.id);
        this.refreshSearchForSelectedPreset();
      }
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

    const scope = this.selectedScope();
    const data: CreateSystemPromptPresetDto = {
      name: this.uniqueName(`${selected.name.trim() || 'Untitled Preset'} Copy`, scope),
      category: selected.category,
      systemPrompt: selected.systemPrompt,
      ...ownershipFor(scope, this.bookId()),
      temperature: selected.temperature,
      topP: selected.topP,
      maxOutputTokens: selected.maxOutputTokens,
      presencePenalty: selected.presencePenalty,
      frequencyPenalty: selected.frequencyPenalty,
      defaultModelId: selected.defaultModelId,
    };

    this.isCreating.set(true);
    try {
      const created = mapDtoToPreset(await this.systemPromptService.create(data));
      this.confirmedPresets.set(created.id, created);
      this.presets.update((presets) => [...presets, created]);
      if (this.selectedScope() === scope && this.selectedCategory() === selected.category) {
        this.selectedPresetId.set(created.id);
        this.refreshSearchForSelectedPreset();
      }
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

      const scope = selected.scope;
      const categoryPresets = this.filteredPresets();
      const selectedIndex = categoryPresets.findIndex((preset) => preset.id === selected.id);
      const remainingPresets = this.presets().filter((preset) => preset.id !== selected.id);
      const remainingCategoryPresets = remainingPresets.filter(
        (preset) =>
          preset.category === selected.category &&
          preset.scope === scope &&
          (scope === 'global' || preset.bookId === this.bookId()),
      );
      const nextSelection =
        remainingCategoryPresets[Math.min(selectedIndex, remainingCategoryPresets.length - 1)];

      this.confirmedPresets.delete(selected.id);
      this.presets.set(remainingPresets);
      this.selectedPresetId.set(nextSelection?.id ?? '');
      this.refreshSearchForSelectedPreset();
    } catch (error) {
      this.showError(error, 'Unable to delete this preset.', 'Preset deletion failed');
      this.deletingPresetId.set(null);
      return;
    }

    if (selected.scope === 'global') {
      this.systemPromptSelectionService.invalidateAll();
    } else {
      this.systemPromptSelectionService.invalidate(this.requiredBookId());
    }
    if (this.globalOnly()) {
      this.deletingPresetId.set(null);
      return;
    }
    try {
      this.activePresetIds.set(
        await this.systemPromptSelectionService.getActivePresetIds(this.requiredBookId(), true),
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
    this.refreshSearch({ resetActiveMatch: false, selectActiveMatch: false });
  }

  async copySystemPrompt(): Promise<void> {
    const selected = this.selectedPreset();
    if (!selected) return;

    try {
      await navigator.clipboard.writeText(selected.systemPrompt);
      if (this.copyConfirmationTimer) clearTimeout(this.copyConfirmationTimer);

      this.promptCopied.set(true);
      this.copyConfirmationTimer = setTimeout(() => {
        this.promptCopied.set(false);
        this.copyConfirmationTimer = null;
      }, COPY_CONFIRMATION_DURATION_MS);
    } catch (error) {
      this.showError(error, 'Unable to copy the system prompt.', 'Copy failed');
    }
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

  showsDefaultModel(category: SystemPromptCategory): boolean {
    return categoryUsesDefaultModel(category);
  }

  isDefaultModelUnavailable(preset: SystemPromptPreset): boolean {
    return !this.aiStore.isLoading()
      && !!preset.defaultModelId
      && !this.aiStore.models().some(model => model.id === preset.defaultModelId);
  }

  async selectDefaultModel(value: unknown): Promise<void> {
    const selected = this.selectedPreset();
    if (!selected || typeof value !== 'string' || !value.trim()) return;

    if (!selected.isBuiltIn) {
      this.updateSelectedPreset({ defaultModelId: value });
      return;
    }

    try {
      const defaultModelId = await this.systemPromptService.setBuiltInDefaultModelId(
        selected.id,
        value,
      );
      this.presets.update(presets => presets.map(preset =>
        preset.id === selected.id ? { ...preset, defaultModelId } : preset,
      ));
      this.systemPromptSelectionService.invalidateAll();
    } catch (error) {
      this.showError(error, 'Unable to save this model.', 'Default model update failed');
    }
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
    if (replacement.id === this.selectedPresetId()) {
      this.refreshSearch({ resetActiveMatch: false, selectActiveMatch: false });
    }
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
    const selectedExists = this.filteredPresets().some(
      (preset) => preset.id === this.selectedPresetId(),
    );
    if (!selectedExists) {
      this.selectDefaultForCurrentView();
      return;
    }
    this.refreshSearchForSelectedPreset();
  }

  private selectDefaultForCurrentView(): void {
    const visiblePresets = this.filteredPresets();
    const defaultPreset =
      this.selectedScope() === 'global'
        ? visiblePresets.find((preset) => preset.id === defaultPresetIdFor(this.selectedCategory()))
        : undefined;
    this.selectedPresetId.set(defaultPreset?.id ?? visiblePresets[0]?.id ?? '');
    this.refreshSearchForSelectedPreset();
  }

  private refreshSearchForSelectedPreset(): void {
    if (!this.searchOpen()) return;
    if (!this.selectedPreset()) {
      this.closeSearch();
      return;
    }

    this.refreshSearch({ resetActiveMatch: true, selectActiveMatch: true });
  }

  private refreshSearch({
    resetActiveMatch,
    selectActiveMatch,
  }: {
    resetActiveMatch: boolean;
    selectActiveMatch: boolean;
  }): void {
    if (!this.searchOpen()) return;

    const matches = this.searchMatches();
    const currentIndex = this.activeSearchMatchIndex();
    const nextIndex = matches.length === 0
      ? -1
      : resetActiveMatch || currentIndex < 0 || currentIndex >= matches.length
        ? 0
        : currentIndex;
    this.activeSearchMatchIndex.set(nextIndex);

    if (selectActiveMatch && nextIndex >= 0) this.selectActiveSearchMatch();
  }

  private selectSearchMatch(direction: -1 | 1): void {
    const matches = this.searchMatches();
    if (matches.length === 0) {
      this.activeSearchMatchIndex.set(-1);
      return;
    }

    const currentIndex = this.activeSearchMatchIndex();
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + direction + matches.length) % matches.length;
    this.activeSearchMatchIndex.set(nextIndex);
    this.selectActiveSearchMatch();
  }

  private selectActiveSearchMatch(): void {
    queueMicrotask(() => {
      const textarea = this.activePromptTextarea();
      const match = this.searchMatches()[this.activeSearchMatchIndex()];
      if (!textarea || !match) return;

      const restoreSearchFocus = !!document.activeElement?.closest('app-search');
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(match.from, match.to);
      this.syncPromptSearchHighlight();
      if (restoreSearchFocus) this.searchWidget?.focusInput({ select: false });
    });
  }

  private capturePromptEditorState(): PromptEditorViewState {
    const textarea = this.activePromptTextarea()!;
    return {
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };
  }

  private restorePromptEditorState(editorState: PromptEditorViewState): void {
    setTimeout(() => {
      const textarea = this.activePromptTextarea();
      if (!textarea) return;

      if (!this.searchOpen()) textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(editorState.selectionStart, editorState.selectionEnd);
      textarea.scrollTop = editorState.scrollTop;
      textarea.scrollLeft = editorState.scrollLeft;
      this.syncPromptSearchHighlight();

      if (this.searchOpen()) {
        this.searchWidget?.focusInput({ select: false });
        return;
      }
    }, 0);
  }

  private activePromptTextarea(): HTMLTextAreaElement | undefined {
    const textareas = this.systemPromptTextareas?.map(({ nativeElement }) => nativeElement) ?? [];
    const expanded = this.promptExpanded();

    return textareas.find((textarea) =>
      textarea.closest('.system-prompt-field')?.classList.contains('is-expanded') === expanded
    );
  }

  private inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private requiredBookId(): string {
    const bookId = this.bookId();
    if (!bookId) throw new Error('A book is required for this prompt preset operation.');
    return bookId;
  }

  private uniqueName(baseName: string, scope: SystemPromptScope): string {
    const names = new Set(
      this.presets()
        .filter((preset) => preset.scope === scope)
        .map((preset) => preset.name),
    );
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

  private async loadBuiltInPresets(): Promise<SystemPromptPreset[]> {
    return await Promise.all(Object.values(BUILT_IN_SYSTEM_PROMPT_PRESETS).map(async preset => ({
      ...preset,
      defaultModelId: preset.defaultModelId === null
        ? null
        : await this.systemPromptService.getBuiltInDefaultModelId(preset.id),
      scope: 'global' as const,
      bookId: null,
      isBuiltIn: true,
    })));
  }
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
    scope: preset.scope,
    bookId: preset.bookId,
    temperature: preset.temperature,
    topP: preset.topP,
    maxOutputTokens: preset.maxOutputTokens,
    presencePenalty: preset.presencePenalty,
    frequencyPenalty: preset.frequencyPenalty,
    defaultModelId: preset.defaultModelId,
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
    defaultModelId: preset.defaultModelId,
  };
}

function createBuiltInPresets(): SystemPromptPreset[] {
  return Object.values(BUILT_IN_SYSTEM_PROMPT_PRESETS).map(preset => ({
    ...preset,
    scope: 'global',
    bookId: null,
    isBuiltIn: true,
  }));
}

function categoryDefinitionFor(category: SystemPromptCategory): SystemPromptCategoryDefinition {
  return SYSTEM_PROMPT_CATEGORIES.find((definition) => definition.id === category)!;
}

function defaultPresetIdFor(category: SystemPromptCategory): string {
  return BUILT_IN_SYSTEM_PROMPT_PRESETS[category].id;
}

function ownershipFor(scope: SystemPromptScope, bookId: string | undefined): SystemPromptOwnership {
  if (scope === 'global') return { scope: 'global' };
  if (!bookId) throw new Error('Book-scoped system prompt presets require a book ID.');
  return { scope: 'book', bookId };
}

function isSystemPromptCategory(value: string): value is SystemPromptCategory {
  return SYSTEM_PROMPT_CATEGORIES.some((category) => category.id === value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
