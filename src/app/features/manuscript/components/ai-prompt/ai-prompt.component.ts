import { Component, ElementRef, ViewChild, computed, signal, inject, effect } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu';
import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AiStore } from '../../store/ai.store';
import { AiStreamEditorService } from '../../helpers/ai-stream-editor.service';

@Component({
  selector: 'app-ai-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkMenuModule, AiPromptSettingsComponent],
  templateUrl: './ai-prompt.component.html',
  styleUrl: './ai-prompt.component.scss'
})
export class AiPromptComponent extends AngularNodeViewComponent {
  @ViewChild('promptInput') promptInput!: ElementRef<HTMLDivElement>;

  // Collapse and delete state/methods
  isCollapsed = signal(false);
  loadingStatus = computed(() => {
    const blockId = this.node().attrs['id'];
    const loadingSig = this.aiStreamEditor.loadingState.get(blockId);
    return loadingSig ? loadingSig() : 'idle';
  });

  isLoading = computed(() => this.loadingStatus() !== 'idle');

  private aiStore = inject(AiStore);
  private aiStreamEditor = inject(AiStreamEditorService);
  private document = inject(DOCUMENT);
  allModels = computed(() => this.aiStore.models());
  searchTerm = signal<string>('');
  activeSubmenuProvider = signal<any | null>(null);

  @ViewChild(CdkMenuTrigger) menuTrigger?: CdkMenuTrigger;

  private scrollListener = (event: Event) => {
    // If the scroll target is inside the menu, ignore it
    const target = event.target as HTMLElement;
    if (target && target.closest && target.closest('.cdk-menu')) {
      return;
    }
    if (this.menuTrigger?.isOpen()) {
      this.menuTrigger.close();
    }
  };

  onMenuOpened() {
    // Listen to all scroll events in capture phase
    this.document.addEventListener('scroll', this.scrollListener, true);
  }

  onMenuClosed() {
    this.document.removeEventListener('scroll', this.scrollListener, true);
  }

  // Fallback flat search results display
  groupedModels = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const models = this.allModels();

    const filtered = term
      ? models.filter(m => m.name.toLowerCase().includes(term) || m.providerName.toLowerCase().includes(term))
      : models;

    const groupMap = new Map<string, any[]>();

    filtered.forEach(m => {
      if (!groupMap.has(m.providerName)) {
        groupMap.set(m.providerName, []);
      }
      groupMap.get(m.providerName)!.push(m);
    });

    const sortedProviderNames = Array.from(groupMap.keys()).sort((a, b) => {
      const aIsDirect = a.includes('(Direct)');
      const bIsDirect = b.includes('(Direct)');
      if (aIsDirect && !bIsDirect) return -1;
      if (!aIsDirect && bIsDirect) return 1;
      return a.localeCompare(b);
    });

    return sortedProviderNames.map(name => ({
      providerName: name,
      models: groupMap.get(name)!
    }));
  });

  mainProviders = computed(() => {
    const models = this.allModels();

    const directModels = models.filter(m => m.source === 'direct');
    const openRouterModels = models.filter(m => m.source === 'openrouter');

    const providers: any[] = [];

    const directGroups = new Map<string, any[]>();
    directModels.forEach(m => {
      if (!directGroups.has(m.provider)) {
        directGroups.set(m.provider, []);
      }
      directGroups.get(m.provider)!.push(m);
    });

    directGroups.forEach((modelsList, providerId) => {
      let displayName = providerId.charAt(0).toUpperCase() + providerId.slice(1);
      if (providerId === 'openai') displayName = 'OpenAI (Direct)';
      if (providerId === 'google') displayName = 'Google Gemini (Direct)';

      providers.push({
        id: providerId,
        name: displayName,
        type: 'direct',
        models: modelsList
      });
    });

    if (openRouterModels.length > 0) {
      providers.push({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openrouter',
        models: openRouterModels
      });
    }

    return providers.sort((a, b) => {
      if (a.type === 'direct' && b.type !== 'direct') return -1;
      if (a.type !== 'direct' && b.type === 'direct') return 1;
      return a.name.localeCompare(b.name);
    });
  });

  openRouterGroups = computed(() => {
    const models = this.allModels().filter(m => m.source === 'openrouter');
    const groupMap = new Map<string, any[]>();

    models.forEach(m => {
      const providerName = m.providerName.replace(/^OpenRouter:\s*/, '');
      if (!groupMap.has(providerName)) {
        groupMap.set(providerName, []);
      }
      groupMap.get(providerName)!.push(m);
    });

    const sortedProviderNames = Array.from(groupMap.keys()).sort((a, b) => a.localeCompare(b));

    return sortedProviderNames.map(name => ({
      providerName: name,
      models: groupMap.get(name)!
    }));
  });

  selectedModelName = computed(() => {
    const id = this.selectedModel();
    if (!id) return 'No model selected';
    const found = this.allModels().find(m => m.id === id);
    if (found) return found.name;
    return id.split('/').pop() || id;
  });

  constructor() {
    super();
    // Set default model once models are loaded and if no selected model exists
    effect(() => {
      const models = this.allModels();
      if (models.length > 0 && !this.selectedModel()) {
        const defaultModel = models.find((m: any) => m.id.includes('free')) || models[0];
        this.selectedModel.set(defaultModel.id);
      }
    });
  }

  collapse(): void {
    this.isCollapsed.update(c => !c);
  }

  colapse(): void {
    this.collapse();
  }

  deletePrompt(): void {
    // Left empty for now
  }

  deleteComponent(): void {
    // Left empty for now
  }

  // Interactive UI states
  promptText = signal('');
  isEmpty = computed(() => {
    const text = this.promptText();
    return !text || text.trim() === '';
  });
  isFocused = signal(false);
  selectedModel = signal<string | null>(null);

  // AI Generation configuration overrides
  wordCount = signal<number>(500);
  pov = signal<string>('global');
  povCharacter = signal<string | null>(null);
  vectorSearch = signal<string>('global');
  reasoningMode = signal<boolean>(false);

  ngOnInit(): void {
    // 1. Restore attributes from Tiptap document on load
    const attrs = this.node()?.attrs;
    if (attrs) {
      this.promptText.set(attrs['promptText'] || '');
      this.selectedModel.set(attrs['selectedModel'] || null);
      this.wordCount.set(attrs['wordCount'] || 500);
      this.pov.set(attrs['pov'] || 'global');
      this.povCharacter.set(attrs['povCharacter'] || null);
      this.vectorSearch.set(attrs['vectorSearch'] || 'global');
      this.reasoningMode.set(attrs['reasoningMode'] || false);
    }

    let blockId = this.node().attrs['id'];

    // Generate an ID if it doesn't have one
    if (!blockId) {
      blockId = crypto.randomUUID();
      // Use setTimeout to avoid Angular lifecycle conflicts when updating the editor
      setTimeout(() => {
        if (typeof this.getPos === 'function') {
          const pos = this.getPos()();
          if (pos != null) {
            const tr = this.editor().state.tr.setNodeMarkup(pos, undefined, {
              ...this.node().attrs,
              id: blockId
            });
            // We set addToHistory to false so generating an ID doesn't mess up undo/redo
            tr.setMeta('addToHistory', false);
            this.editor().view.dispatch(tr);
          }
        }
      });
    }

    if (!this.aiStreamEditor.loadingState.has(blockId)) {
      this.aiStreamEditor.loadingState.set(blockId, signal('idle'));
    }
    this.aiStore.loadModels();
  }

  ngAfterViewInit(): void {
    // 2. Restore contenteditable text once view is initialized
    if (this.promptInput && this.promptText()) {
      this.promptInput.nativeElement.innerText = this.promptText();
    }

    // Auto-focus if newly created and the editor is currently focused
    if (this.promptInput && !this.promptText() && this.editor()?.isFocused) {
      this.promptInput.nativeElement.focus();
    }
  }

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

    // Sync text back to Tiptap
    this.updateAttributes()({ promptText: text });
  }

  setPromptText(text: string): void {
    this.promptText.set(text);
    if (this.promptInput) {
      this.promptInput.nativeElement.innerText = text;
    }
    // Sync text back to Tiptap
    this.updateAttributes()({ promptText: text });
  }

  // 3. Change handlers that update state and sync with Tiptap
  onWordCountChange(value: number): void {
    this.wordCount.set(value);
    this.updateAttributes()({ wordCount: value });
  }

  onPovChange(value: string): void {
    this.pov.set(value);
    this.updateAttributes()({ pov: value });
  }

  onPovCharacterChange(value: string | null): void {
    this.povCharacter.set(value);
    this.updateAttributes()({ povCharacter: value });
  }

  onVectorSearchChange(value: string): void {
    this.vectorSearch.set(value);
    this.updateAttributes()({ vectorSearch: value });
  }

  onReasoningModeChange(value: boolean): void {
    this.reasoningMode.set(value);
    this.updateAttributes()({ reasoningMode: value });
  }

  onModelChange(model: string | null): void {
    this.selectedModel.set(model);
    this.updateAttributes()({ selectedModel: model });
  }

  onSettingsReset(): void {
    this.wordCount.set(500);
    this.pov.set('global');
    this.povCharacter.set(null);
    this.vectorSearch.set('global');
    this.reasoningMode.set(false);

    this.updateAttributes()({
      wordCount: 500,
      pov: 'global',
      povCharacter: null,
      vectorSearch: 'global',
      reasoningMode: false
    });
  }

  async onSubmit(): Promise<void> {

    const blockId = this.node().attrs['id'];


    // Prevent multiple submissions while already generating
    if (this.isLoading()) return;

    const text = this.promptText().trim();
    if (text && typeof this.getPos === 'function') {
      // Calculate the position immediately after this prompt component
      const pos: number = this.getPos()() ?? 0;
      const nodeSizePosition: number = this.node().nodeSize + pos;

      // Determine provider and modelId
      const selectedId = this.selectedModel();
      const selectedModelObj = this.allModels().find(m => m.id === selectedId);

      let provider = 'openrouter';
      let modelId: string = '';

      if (selectedModelObj) {
        if (selectedModelObj.source === 'direct') {
          provider = selectedModelObj.provider;
          modelId = selectedModelObj.id.split('/')[1];
        } else {
          provider = 'openrouter';
          modelId = selectedModelObj.id;
        }
      }

      const loadingSig = this.aiStreamEditor.loadingState.get(blockId);
      loadingSig?.set('loading');

      try {
        await this.aiStreamEditor.generateNewBlock(
          this.editor(),
          nodeSizePosition,
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
  }

  clearPrompt(): void {
    this.setPromptText('');
  }

  removePrompt(): void {
    if (typeof this.getPos === 'function') {
      const pos = this.getPos()() ?? 0;
      this.editor().commands.deleteRange({ from: pos, to: pos + this.node().nodeSize });

    }
  }

  ngOnDestroy(): void {
    this.aiStreamEditor.loadingState.delete(this.node().attrs['id']);
    this.document.removeEventListener('scroll', this.scrollListener, true);
  }
}
