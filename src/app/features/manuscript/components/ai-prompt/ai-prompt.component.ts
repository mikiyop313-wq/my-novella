import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, ElementRef, ViewChild, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';

import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AiStreamEditorService } from '../../helpers/ai/ai-stream-editor.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { AiStore } from '../../../../core/store/ai.store';
import { AiContextDropdownComponent, type AiContextSelection } from './ai-context-dropdown.component';

// ---------------------------------------------------------------------------
//  Local Types
// ---------------------------------------------------------------------------

type ModelSource = 'direct' | 'openrouter' | string;

interface AiModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  source: ModelSource;
}

interface ModelGroup {
  providerName: string;
  models: AiModel[];
}

interface MenuProvider {
  id: string;
  name: string;
  type: 'direct' | 'openrouter';
  models: AiModel[];
}

interface PromptSettings {
  wordCount: number;
  pov: string;
  povCharacter: string | null;
  vectorSearch: string;
  reasoningMode: boolean;
}

// ---------------------------------------------------------------------------
//  Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  wordCount: 500,
  pov: 'global',
  povCharacter: null,
  vectorSearch: 'global',
  reasoningMode: false
};

const DIRECT_PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI (Direct)',
  google: 'Google Gemini (Direct)'
};

@Component({
  selector: 'app-ai-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, AiPromptSettingsComponent, AiContextDropdownComponent],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {

  // ---------------------------------------------------------------------------
  //  Dependency Injection
  // ---------------------------------------------------------------------------

  private readonly aiStore = inject(AiStore);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly document = inject(DOCUMENT);
  private readonly manuscriptStore = inject(ManuscriptStore);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly codexContext = inject(CodexContextTrieService);

  readonly contextHierarchy = this.manuscriptStore.bookHierarchy;
  readonly contextHierarchyLoading = this.workspaceBookStore.isLoadingBookHierarchy;
  readonly contextHierarchyError = this.workspaceBookStore.bookHierarchyError;
  readonly contextCodexEntries = this.codexContext.entries;
  readonly contextCodexLoading = this.codexContext.isLoading;
  readonly contextCodexError = this.codexContext.error;


  // ---------------------------------------------------------------------------
  //  View Children
  // ---------------------------------------------------------------------------

  @ViewChild('promptInput') promptInput!: ElementRef<HTMLDivElement>;

  @ViewChild(CdkMenuTrigger) menuTrigger?: CdkMenuTrigger;


  // ---------------------------------------------------------------------------
  //  Component State
  // ---------------------------------------------------------------------------

  isCollapsed = signal(false);
  promptText = signal('');
  isFocused = signal(false);
  selectedModel = signal<string | null>(null);
  searchTerm = signal('');
  activeSubmenuProvider = signal<MenuProvider | null>(null);

  // Per-prompt generation settings persisted on the Tiptap node.
  wordCount = signal(DEFAULT_PROMPT_SETTINGS.wordCount);
  pov = signal(DEFAULT_PROMPT_SETTINGS.pov);
  povCharacter = signal<string | null>(DEFAULT_PROMPT_SETTINGS.povCharacter);
  vectorSearch = signal(DEFAULT_PROMPT_SETTINGS.vectorSearch);
  reasoningMode = signal(DEFAULT_PROMPT_SETTINGS.reasoningMode);

  // ---------------------------------------------------------------------------
  //  Context Selection State
  // ---------------------------------------------------------------------------

  includeFullOutline = signal(false);
  contextSceneIds = signal<string[]>([]);
  contextCodexEntryIds = signal<string[]>([]);


  // ---------------------------------------------------------------------------
  //  Computed Properties
  // ---------------------------------------------------------------------------

  allModels = computed<AiModel[]>(() => this.aiStore.models() as AiModel[]);

  isEmpty = computed(() => {
    const text = this.promptText();
    return !text || text.trim() === '';
  });

  loadingStatus = computed(() => {
    const blockId = this.blockId();
    const loadingSig = this.loadingSignal(blockId);
    return loadingSig ? loadingSig() : 'idle';
  });

  isLoading = computed(() => this.loadingStatus() !== 'idle');

  selectedModelName = computed(() => {
    const id = this.selectedModel();

    if (!id) return 'No model selected';

    const found = this.allModels().find(m => m.id === id);
    if (found) return found.name;

    return id.split('/').pop() || id;
  });

  /**
   * Flat grouped models used as a fallback search results display.
   * Groups all models by provider, with "Direct" providers sorted first.
   */
  groupedModels = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const models = this.allModels();
    const filteredModels = term ? models.filter(model => this.modelMatchesSearch(model, term)) : models;

    return this.groupModelsByProviderName(filteredModels, this.sortDirectProvidersFirst);
  });

  /**
   * Top-level providers for the model selector menu.
   * Direct API providers appear first, followed by OpenRouter.
   */
  mainProviders = computed(() => {
    const models = this.allModels();
    const directProviders = this.buildDirectProviders(models.filter(model => model.source === 'direct'));
    const openRouterProvider = this.buildOpenRouterProvider(models.filter(model => model.source === 'openrouter'));

    return [...directProviders, ...openRouterProvider].sort(this.sortMenuProviders);
  });

  /**
   * Sub-grouped OpenRouter models by their upstream provider name.
   */
  openRouterGroups = computed(() => {
    const models = this.allModels().filter(model => model.source === 'openrouter');

    return this.groupModelsByProviderName(
      models,
      (a, b) => a.localeCompare(b),
      providerName => providerName.replace(/^OpenRouter:\s*/, '')
    );
  });


  // ---------------------------------------------------------------------------
  //  Scroll-close listener for dropdown menu
  // ---------------------------------------------------------------------------

  private scrollListener = (event: Event) => {
    const target = event.target as HTMLElement;

    // Ignore scroll events originating inside the menu overlay
    if (target?.closest?.('.cdk-menu')) return;

    if (this.menuTrigger?.isOpen()) {
      this.menuTrigger.close();
    }
  };


  // ---------------------------------------------------------------------------
  //  Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    super();

    // Auto-select once models arrive. This effect intentionally does not
    // overwrite a model restored from persisted node attributes.
    effect(() => {
      const models = this.allModels();

      if (models.length > 0 && !this.selectedModel()) {
        const defaultModel = models.find(model => model.id.includes('free')) || models[0];
        this.selectedModel.set(defaultModel.id);
      }
    });
  }


  // ---------------------------------------------------------------------------
  //  Lifecycle Hooks
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.restoreAttributesFromNode();
    this.ensureBlockId();
    this.aiStore.loadModels();
  }

  ngAfterViewInit(): void {
    // The prompt body is contenteditable, so Angular cannot bind it like a
    // normal input. Restore the DOM text once the NodeView exists.
    if (this.promptInput && this.promptText()) {
      this.promptInput.nativeElement.innerText = this.promptText();
    }

    // Auto-focus if newly created and the editor is currently focused
    if (this.promptInput && !this.promptText() && this.editor()?.isFocused) {
      this.promptInput.nativeElement.focus();
    }
  }

  ngOnDestroy(): void {
    this.aiStreamEditor.loadingState.delete(this.blockId());
    this.document.removeEventListener('scroll', this.scrollListener, true);
  }


  // ---------------------------------------------------------------------------
  //  Menu Event Handlers
  // ---------------------------------------------------------------------------

  onMenuOpened(): void {
    this.document.addEventListener('scroll', this.scrollListener, true);
  }

  onMenuClosed(): void {
    this.document.removeEventListener('scroll', this.scrollListener, true);
  }


  // ---------------------------------------------------------------------------
  //  Prompt Input Event Handlers
  // ---------------------------------------------------------------------------

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    this.isFocused.set(false);
  }

  onInput(event: Event): void {
    const target = event.target as HTMLDivElement;
    const text = target.innerText || '';

    this.promptText.set(text);
    this.updateAttributes()({ promptText: text });
  }


  // ---------------------------------------------------------------------------
  //  Settings Change Handlers (sync state to Tiptap)
  // ---------------------------------------------------------------------------

  onModelChange(model: string | null): void {
    this.setAttribute(this.selectedModel, 'selectedModel', model);
  }

  onWordCountChange(value: number): void {
    this.setAttribute(this.wordCount, 'wordCount', value);
  }

  onPovChange(value: string): void {
    this.setAttribute(this.pov, 'pov', value);
  }

  onPovCharacterChange(value: string | null): void {
    this.setAttribute(this.povCharacter, 'povCharacter', value);
  }

  onVectorSearchChange(value: string): void {
    this.setAttribute(this.vectorSearch, 'vectorSearch', value);
  }

  onReasoningModeChange(value: boolean): void {
    this.setAttribute(this.reasoningMode, 'reasoningMode', value);
  }

  onSettingsReset(): void {
    this.applySettings(DEFAULT_PROMPT_SETTINGS);
    this.updateAttributes()(DEFAULT_PROMPT_SETTINGS);
  }

  onContextChange(selection: AiContextSelection): void {
    const sceneIds = [...new Set(selection.sceneIds)];
    const codexEntryIds = [...new Set(selection.codexEntryIds)];

    this.includeFullOutline.set(selection.includeFullOutline);
    this.contextSceneIds.set(sceneIds);
    this.contextCodexEntryIds.set(codexEntryIds);
    this.updateAttributes()({
      includeFullOutline: selection.includeFullOutline,
      contextSceneIds: sceneIds,
      contextCodexEntryIds: codexEntryIds,
    });
  }

  // ---------------------------------------------------------------------------
  //  Actions
  // ---------------------------------------------------------------------------

  collapse(): void {
    this.isCollapsed.update(c => !c);
  }

  setPromptText(text: string): void {
    this.promptText.set(text);

    if (this.promptInput) {
      this.promptInput.nativeElement.innerText = text;
    }

    this.updateAttributes()({ promptText: text });
  }

  clearPrompt(): void {
    this.setPromptText('');
  }

  removePrompt(): void {
    const pos = this.currentNodePosition();
    if (pos === null) return;

    this.editor().commands.deleteRange({ from: pos, to: pos + this.node().nodeSize });
  }

  async onSubmit(): Promise<void> {
    const blockId = this.blockId();

    if (this.isLoading()) return;

    const text = this.promptText().trim();
    const pos = this.currentNodePosition();

    if (!text || pos === null) return;

    const insertAt: number = pos + this.node().nodeSize;
    const { provider, modelId } = this.resolveSelectedModel();

    const loadingSig = this.loadingSignal(blockId);
    loadingSig?.set('loading');

    try {
      await this.aiStreamEditor.generateNewBlock(
        this.editor(),
        insertAt,
        text,
        provider,
        modelId,
        this.reasoningMode(),
        blockId
      );
    } finally {
      loadingSig?.set('idle');
    }
  }

  async stopGeneration(): Promise<void> {
    const blockId = this.blockId();
    const loadingSig = this.loadingSignal(blockId);

    await this.aiStreamEditor.stopGeneration(blockId);

    loadingSig?.set('idle');
  }


  // ---------------------------------------------------------------------------
  //  Private Helpers
  // ---------------------------------------------------------------------------

  /** Restore all persisted attributes from the Tiptap node back into local signals. */
  private restoreAttributesFromNode(): void {
    const attrs = this.node()?.attrs;
    if (!attrs) return;

    this.promptText.set(attrs['promptText'] || '');
    this.selectedModel.set(attrs['selectedModel'] || null);
    this.includeFullOutline.set(attrs['includeFullOutline'] === true);
    this.contextSceneIds.set(this.restoreStringArray(attrs['contextSceneIds']));
    this.contextCodexEntryIds.set(this.restoreStringArray(attrs['contextCodexEntryIds']));
    this.applySettings({
      wordCount: attrs['wordCount'] || DEFAULT_PROMPT_SETTINGS.wordCount,
      pov: attrs['pov'] || DEFAULT_PROMPT_SETTINGS.pov,
      povCharacter: attrs['povCharacter'] || DEFAULT_PROMPT_SETTINGS.povCharacter,
      vectorSearch: attrs['vectorSearch'] || DEFAULT_PROMPT_SETTINGS.vectorSearch,
      reasoningMode: attrs['reasoningMode'] || DEFAULT_PROMPT_SETTINGS.reasoningMode
    });
  }

  /** Ensure the node has a unique block ID; generate one if missing. */
  private ensureBlockId(): void {
    let blockId = this.blockId();

    if (!blockId) {
      blockId = crypto.randomUUID();

      // Use setTimeout to avoid Angular lifecycle conflicts when updating the editor
      setTimeout(() => {
        const pos = this.currentNodePosition();

        if (pos != null) {
          const tr = this.editor().state.tr.setNodeMarkup(pos, undefined, {
            ...this.node().attrs,
            id: blockId
          });

          // Don't pollute undo/redo history with internal ID assignment
          tr.setMeta('addToHistory', false);
          this.editor().view.dispatch(tr);
        }
      });
    }

    if (!this.aiStreamEditor.loadingState.has(blockId)) {
      this.aiStreamEditor.loadingState.set(blockId, signal('idle'));
    }
  }

  /** Returns the stable ID used to connect this prompt with its loading state. */
  private blockId(): string {
    return this.node().attrs['id'] || '';
  }

  /** Apply all prompt settings to local signals without touching Tiptap attrs. */
  private applySettings(settings: PromptSettings): void {
    this.wordCount.set(settings.wordCount);
    this.pov.set(settings.pov);
    this.povCharacter.set(settings.povCharacter);
    this.vectorSearch.set(settings.vectorSearch);
    this.reasoningMode.set(settings.reasoningMode);
  }

  /** Sync a single local signal and its matching Tiptap node attribute. */
  private setAttribute<T>(state: WritableSignal<T>, attrName: string, value: T): void {
    state.set(value);
    this.updateAttributes()({ [attrName]: value });
  }

  private restoreStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  }

  /** Safely read the current node position from the Tiptap NodeView API. */
  private currentNodePosition(): number | null {
    if (typeof this.getPos !== 'function') return null;

    return this.getPos()() ?? null;
  }

  /** Get the per-block loading signal managed by the AI stream service. */
  private loadingSignal(blockId: string): WritableSignal<LoadingStatus> | undefined {
    return this.aiStreamEditor.loadingState.get(blockId);
  }

  /** Translate the selected UI model into the provider/model IDs expected by the stream service. */
  private resolveSelectedModel(): { provider: string; modelId: string } {
    const selectedModelObj = this.allModels().find(model => model.id === this.selectedModel());

    if (!selectedModelObj) {
      return { provider: 'openrouter', modelId: '' };
    }

    if (selectedModelObj.source !== 'direct') {
      return { provider: 'openrouter', modelId: selectedModelObj.id };
    }

    return {
      provider: selectedModelObj.provider,
      modelId: selectedModelObj.id.split('/')[1] || selectedModelObj.id
    };
  }

  /** Check whether a model should appear for the current search term. */
  private modelMatchesSearch(model: AiModel, term: string): boolean {
    return model.name.toLowerCase().includes(term) || model.providerName.toLowerCase().includes(term);
  }

  /** Build grouped model lists for search results and OpenRouter submenus. */
  private groupModelsByProviderName(
    models: AiModel[],
    sortProviders: (a: string, b: string) => number,
    normalizeProviderName: (providerName: string) => string = providerName => providerName
  ): ModelGroup[] {
    const groupMap = new Map<string, AiModel[]>();

    models.forEach(model => {
      const providerName = normalizeProviderName(model.providerName);
      const group = groupMap.get(providerName) ?? [];

      group.push(model);
      groupMap.set(providerName, group);
    });

    return Array.from(groupMap.keys())
      .sort(sortProviders)
      .map(providerName => ({
        providerName,
        models: groupMap.get(providerName)!
      }));
  }

  /** Build top-level menu entries for direct API providers. */
  private buildDirectProviders(models: AiModel[]): MenuProvider[] {
    const groupedModels = new Map<string, AiModel[]>();

    models.forEach(model => {
      const group = groupedModels.get(model.provider) ?? [];

      group.push(model);
      groupedModels.set(model.provider, group);
    });

    return Array.from(groupedModels.entries()).map(([providerId, providerModels]) => ({
      id: providerId,
      name: this.directProviderDisplayName(providerId),
      type: 'direct',
      models: providerModels
    }));
  }

  /** Build the aggregated OpenRouter top-level menu entry. */
  private buildOpenRouterProvider(models: AiModel[]): MenuProvider[] {
    return models.length
      ? [{
          id: 'openrouter',
          name: 'OpenRouter',
          type: 'openrouter',
          models
        }]
      : [];
  }

  /** Prefer friendly display names for known direct providers. */
  private directProviderDisplayName(providerId: string): string {
    return DIRECT_PROVIDER_NAMES[providerId] ?? this.capitalize(providerId);
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** Sort direct providers above aggregated OpenRouter providers. */
  private sortMenuProviders(a: MenuProvider, b: MenuProvider): number {
    if (a.type === 'direct' && b.type !== 'direct') return -1;
    if (a.type !== 'direct' && b.type === 'direct') return 1;

    return a.name.localeCompare(b.name);
  }

  /** Sort search result groups with Direct providers first. */
  private sortDirectProvidersFirst(a: string, b: string): number {
    const aIsDirect = a.includes('(Direct)');
    const bIsDirect = b.includes('(Direct)');

    if (aIsDirect && !bIsDirect) return -1;
    if (!aIsDirect && bIsDirect) return 1;

    return a.localeCompare(b);
  }
}
