import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Transaction } from '@tiptap/pm/state';
import { AngularNodeViewComponent } from 'ngx-tiptap';

import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AiStreamEditorService } from '../../helpers/ai/ai-stream-editor.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { AiStore } from '../../../../core/store/ai.store';
import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import {
  findDetectedCodexEntryIdsAbovePrompt,
  getAutomaticallyIncludedCodexEntryIds,
  removeAutomaticallyIncludedCodexEntryIds,
} from './ai-prompt-codex-context';
import {
  type AiContextSelection,
  type AiPromptModel,
  buildContextDropdownSections,
  buildModelDropdownSections,
  contextSelectionToValues,
  dropdownValuesToContextSelection,
} from './ai-prompt-dropdown-options';

// ---------------------------------------------------------------------------
//  Local Types
// ---------------------------------------------------------------------------

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

@Component({
  selector: 'app-ai-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, AiPromptSettingsComponent, AutocompleteDropdownComponent],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {

  // ---------------------------------------------------------------------------
  //  Dependency Injection
  // ---------------------------------------------------------------------------

  private readonly aiStore = inject(AiStore);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly manuscriptStore = inject(ManuscriptStore);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly codexContext = inject(CodexContextTrieService);

  readonly contextHierarchy = this.manuscriptStore.bookHierarchy;
  readonly contextHierarchyLoading = this.workspaceBookStore.isLoadingBookHierarchy;
  readonly contextHierarchyError = this.workspaceBookStore.bookHierarchyError;
  readonly contextCodexEntries = this.codexContext.entries;
  readonly contextCodexTrie = this.codexContext.trie;
  readonly contextCodexLoading = this.codexContext.isLoading;
  readonly contextCodexError = this.codexContext.error;


  // ---------------------------------------------------------------------------
  //  View Children
  // ---------------------------------------------------------------------------

  @ViewChild('promptInput') promptInput!: ElementRef<HTMLDivElement>;


  // ---------------------------------------------------------------------------
  //  Component State
  // ---------------------------------------------------------------------------

  isCollapsed = signal(false);
  promptText = signal('');
  isFocused = signal(false);
  selectedModel = signal<string | null>(null);

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
  automaticallyIncludedCodexEntryIds = signal<ReadonlySet<string>>(new Set());


  // ---------------------------------------------------------------------------
  //  Computed Properties
  // ---------------------------------------------------------------------------

  allModels = computed<AiPromptModel[]>(() => this.aiStore.models() as AiPromptModel[]);

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

  modelDropdownSections = computed(() => buildModelDropdownSections(this.allModels()));

  contextDropdownSections = computed(() => buildContextDropdownSections({
    hierarchy: this.contextHierarchy(),
    codexEntries: this.contextCodexEntries(),
    automaticallyIncludedCodexEntryIds: this.automaticallyIncludedCodexEntryIds(),
    hierarchyLoading: this.contextHierarchyLoading(),
    codexLoading: this.contextCodexLoading(),
    hierarchyError: this.contextHierarchyError(),
    codexError: this.contextCodexError(),
  }));

  selectedContextValues = computed(() => contextSelectionToValues({
    includeFullOutline: this.includeFullOutline(),
    sceneIds: this.contextSceneIds(),
    codexEntryIds: this.contextCodexEntryIds(),
  }));


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

    // Codex entries and their compiled matcher load asynchronously. Refresh
    // prompt-local availability when either source is replaced.
    effect(() => {
      this.contextCodexEntries();
      this.contextCodexTrie();
      if (this.contextTrackingInitialized) this.scheduleContextAvailabilityRefresh();
    });
  }


  // ---------------------------------------------------------------------------
  //  Lifecycle Hooks
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.restoreAttributesFromNode();
    this.ensureBlockId();
    this.aiStore.loadModels();
    this.contextTrackingInitialized = true;
    this.editor().on('transaction', this.onEditorTransaction);
    this.refreshContextAvailability();
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
    this.contextTrackingDestroyed = true;
    this.editor().off('transaction', this.onEditorTransaction);
    this.aiStreamEditor.loadingState.delete(this.blockId());
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

  onContextChange(values: readonly string[]): void {
    const selection: AiContextSelection = dropdownValuesToContextSelection(values);
    const sceneIds = [...new Set(selection.sceneIds)];
    const codexEntryIds = removeAutomaticallyIncludedCodexEntryIds(
      [...new Set(selection.codexEntryIds)],
      this.automaticallyIncludedCodexEntryIds(),
    );

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

  /** Rechecks tracking immediately before presenting the context menu. */
  refreshContextAvailability(): void {
    const pos = this.currentNodePosition();
    if (pos === null) return;

    const detectedEntryIds = findDetectedCodexEntryIdsAbovePrompt(
      this.editor().state.doc,
      pos,
      text => this.codexContext.findMatches(text),
    );
    const automaticallyIncludedEntryIds = getAutomaticallyIncludedCodexEntryIds(
      this.contextCodexEntries(),
      detectedEntryIds,
    );

    if (!this.setsEqual(this.automaticallyIncludedCodexEntryIds(), automaticallyIncludedEntryIds)) {
      this.automaticallyIncludedCodexEntryIds.set(automaticallyIncludedEntryIds);
    }

    const selectedEntryIds = this.contextCodexEntryIds();
    const reconciledEntryIds = removeAutomaticallyIncludedCodexEntryIds(
      selectedEntryIds,
      automaticallyIncludedEntryIds,
    );

    if (reconciledEntryIds.length !== selectedEntryIds.length) {
      this.contextCodexEntryIds.set(reconciledEntryIds);
      this.updateAttributes()({ contextCodexEntryIds: reconciledEntryIds });
    }
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

  private contextTrackingInitialized = false;
  private contextTrackingDestroyed = false;
  private contextAvailabilityRefreshQueued = false;

  private readonly onEditorTransaction = ({ transaction }: { transaction: Transaction }): void => {
    if (transaction.docChanged) this.scheduleContextAvailabilityRefresh();
  };

  private scheduleContextAvailabilityRefresh(): void {
    if (this.contextAvailabilityRefreshQueued || this.contextTrackingDestroyed) return;

    this.contextAvailabilityRefreshQueued = true;
    queueMicrotask(() => {
      this.contextAvailabilityRefreshQueued = false;
      if (!this.contextTrackingDestroyed) this.refreshContextAvailability();
    });
  }

  private setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    return left.size === right.size && [...left].every(value => right.has(value));
  }

}
