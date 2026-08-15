import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, WritableSignal, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Transaction } from '@tiptap/pm/state';
import { AngularNodeViewComponent } from 'ngx-tiptap';

import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AiStreamEditorService } from '../../helpers/ai/ai-stream-editor.service';
import { ManuscriptAiRequestService } from '../../helpers/ai/manuscript-ai-request.service';
import type { ManuscriptAiPointOfViewSetting } from '../../helpers/ai/manuscript-ai-context.service';
import { ManuscriptStore } from '../../store/manuscript.store';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { CodexContextHighlightDirective } from '../../../codex/highlighting/codex-context-highlight.directive';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { LoadingStatus } from '../../../../core/services/ai-stream.service';
import { AiStore } from '../../../../core/store/ai.store';
import { AutocompleteDropdownComponent } from '../../../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import type { AiManuscriptContextRef } from '../../../../shared/models/ai-context.model';
import {
  isVectorSearchSetting,
  type VectorSearchSetting,
} from '../../../../shared/models/vector-search.model';
import {
  findDetectedCodexEntryIdsForPrompt,
  getAutomaticallyIncludedCodexEntryIds,
  reconcileSelectedCodexEntryIds,
  removeAutomaticallyIncludedCodexEntryIds,
} from './ai-prompt-codex-context';
import {
  type AiContextSelection,
  type AiPromptModel,
  buildContextDropdownSections,
  buildModelDropdownSections,
  contextSelectionToValues,
  dropdownValuesToContextSelection,
  filterSelectableManuscriptRefs,
  restoreManuscriptContextRefs,
} from './ai-prompt-dropdown-options';

// ---------------------------------------------------------------------------
//  Local Types
// ---------------------------------------------------------------------------

interface PromptSettings {
  wordCount: number;
  pov: ManuscriptAiPointOfViewSetting;
  povCharacter: string | null;
  vectorSearch: VectorSearchSetting;
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
  imports: [
    CommonModule,
    FormsModule,
    AiPromptSettingsComponent,
    AutocompleteDropdownComponent,
    CodexContextHighlightDirective,
  ],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {

  // ---------------------------------------------------------------------------
  //  Dependency Injection
  // ---------------------------------------------------------------------------

  private readonly aiStore = inject(AiStore);
  private readonly aiStreamEditor = inject(AiStreamEditorService);
  private readonly manuscriptAiRequest = inject(ManuscriptAiRequestService);
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
  private readonly modelSelectionInitialized = signal(false);
  private readonly requiresModelReselection = signal(false);
  private activeResponseId: string | null = null;

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
  contextManuscriptRefs = signal<AiManuscriptContextRef[]>([]);
  contextCodexEntryIds = signal<string[]>([]);
  automaticallyIncludedCodexEntryIds = signal<ReadonlySet<string>>(new Set());


  // ---------------------------------------------------------------------------
  //  Computed Properties
  // ---------------------------------------------------------------------------

  allModels = computed<AiPromptModel[]>(() => this.aiStore.models());

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

  isSelectedModelAvailable = computed(() => {
    const selectedModel = this.selectedModel();
    return !!selectedModel && this.allModels().some((model) => model.id === selectedModel);
  });

  modelDropdownSections = computed(() => buildModelDropdownSections({
    providers: this.aiStore.modelProviders(),
    loading: this.aiStore.isLoading(),
    error: this.aiStore.error(),
  }));

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
    manuscriptRefs: this.contextManuscriptRefs(),
    codexEntryIds: this.contextCodexEntryIds(),
  }, this.contextHierarchy()));


  // ---------------------------------------------------------------------------
  //  Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    super();

    // Auto-select only for a genuinely new prompt. A persisted model that is
    // no longer available is cleared and must be replaced explicitly.
    effect(() => {
      if (
        !this.modelSelectionInitialized()
        || this.aiStore.isLoading()
        || !this.aiStore.hasLoaded()
      ) return;

      const models = this.allModels();
      const selectedModel = this.selectedModel();

      if (selectedModel && !models.some((model) => model.id === selectedModel)) {
        this.requiresModelReselection.set(true);
        this.setAttribute(this.selectedModel, 'selectedModel', null);
        return;
      }

      if (models.length > 0 && !selectedModel && !this.requiresModelReselection()) {
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

    effect(() => {
      if (!this.modelSelectionInitialized() || this.contextHierarchyLoading()) return;

      const currentRefs = this.contextManuscriptRefs();
      const selectableRefs = filterSelectableManuscriptRefs(this.contextHierarchy(), currentRefs);
      if (selectableRefs.length === currentRefs.length
        && selectableRefs.every((ref, index) => ref === currentRefs[index])) return;

      this.contextManuscriptRefs.set(selectableRefs);
      this.updateAttributes()({
        contextManuscriptRefs: selectableRefs,
        contextSceneIds: [],
      });
    });
  }


  // ---------------------------------------------------------------------------
  //  Lifecycle Hooks
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.restoreAttributesFromNode();
    this.modelSelectionInitialized.set(true);
    this.ensureBlockId();
    void this.aiStore.ensureModelsLoaded();
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
    this.scheduleContextAvailabilityRefresh();
  }


  // ---------------------------------------------------------------------------
  //  Settings Change Handlers (sync state to Tiptap)
  // ---------------------------------------------------------------------------

  onModelChange(model: string | null): void {
    if (model) this.requiresModelReselection.set(false);
    this.setAttribute(this.selectedModel, 'selectedModel', model);
  }

  onWordCountChange(value: number): void {
    this.setAttribute(this.wordCount, 'wordCount', value);
  }

  onPovChange(value: string): void {
    if (!isPointOfViewSetting(value)) return;
    this.setAttribute(this.pov, 'pov', value);
  }

  onPovCharacterChange(value: string | null): void {
    this.setAttribute(this.povCharacter, 'povCharacter', value);
  }

  onVectorSearchChange(value: VectorSearchSetting): void {
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
    const selection: AiContextSelection = dropdownValuesToContextSelection(
      values,
      this.contextHierarchy(),
    );
    const manuscriptRefs = [...new Set(selection.manuscriptRefs)];
    const codexEntryIds = removeAutomaticallyIncludedCodexEntryIds(
      [...new Set(selection.codexEntryIds)],
      this.automaticallyIncludedCodexEntryIds(),
    );

    this.includeFullOutline.set(selection.includeFullOutline);
    this.contextManuscriptRefs.set(manuscriptRefs);
    this.contextCodexEntryIds.set(codexEntryIds);
    this.updateAttributes()({
      includeFullOutline: selection.includeFullOutline,
      contextManuscriptRefs: manuscriptRefs,
      contextSceneIds: [],
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
    this.scheduleContextAvailabilityRefresh();
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

    if (this.isLoading() || this.aiStreamEditor.hasActiveGeneration()) return;

    const text = this.promptText().trim();
    const pos = this.currentNodePosition();

    if (!text || pos === null || !this.isSelectedModelAvailable()) return;

    this.refreshContextAvailability();
    const loadingSig = this.loadingSignal(blockId);
    loadingSig?.set('loading');

    try {
      const prepared = await this.manuscriptAiRequest.prepare({
        editor: this.editor(),
        promptPos: pos,
        promptAttrs: this.node().attrs,
        requestMessages: [{
          role: 'user',
          parts: [{ type: 'text', content: text }],
        }],
        contextPromptText: text,
      });
      if (!prepared) return;

      const latestPos = this.currentNodePosition();
      if (latestPos === null) return;

      const responseId = crypto.randomUUID();
      this.activeResponseId = responseId;
      await this.aiStreamEditor.generateNewBlock({
        editor: this.editor(),
        insertPos: latestPos + this.node().nodeSize,
        aiPrompt: prepared.aiPrompt,
        provider: prepared.provider,
        modelId: prepared.modelId,
        reasoningMode: prepared.reasoningMode,
        bookId: prepared.bookId,
        responseId,
        sourcePromptId: blockId,
      });
    } finally {
      this.activeResponseId = null;
      loadingSig?.set('idle');
    }
  }

  async stopGeneration(): Promise<void> {
    const blockId = this.blockId();
    const loadingSig = this.loadingSignal(blockId);

    if (this.activeResponseId) {
      await this.aiStreamEditor.stopGeneration(this.activeResponseId);
    }

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
    this.contextManuscriptRefs.set(restoreManuscriptContextRefs(
      attrs['contextManuscriptRefs'],
      attrs['contextSceneIds'],
    ));
    this.contextCodexEntryIds.set(this.restoreStringArray(attrs['contextCodexEntryIds']));
    this.applySettings({
      wordCount: attrs['wordCount'] ?? DEFAULT_PROMPT_SETTINGS.wordCount,
      pov: attrs['pov'] || DEFAULT_PROMPT_SETTINGS.pov,
      povCharacter: attrs['povCharacter'] || DEFAULT_PROMPT_SETTINGS.povCharacter,
      vectorSearch: isVectorSearchSetting(attrs['vectorSearch'])
        ? attrs['vectorSearch']
        : DEFAULT_PROMPT_SETTINGS.vectorSearch,
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
    if (
      this.contextCodexLoading()
      || this.contextCodexError()
      || this.contextCodexTrie() === null
    ) return;

    const pos = this.currentNodePosition();
    if (pos === null) return;

    const detectedEntryIds = findDetectedCodexEntryIdsForPrompt(
      this.editor().state.doc,
      pos,
      this.promptText(),
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
    const reconciledEntryIds = reconcileSelectedCodexEntryIds({
      selectedEntryIds,
      entries: this.contextCodexEntries(),
      automaticallyIncludedEntryIds,
    });

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

function isPointOfViewSetting(value: string): value is ManuscriptAiPointOfViewSetting {
  return value === 'global'
    || value === 'first'
    || value === 'second'
    || value === 'third_limited'
    || value === 'third_omni';
}
