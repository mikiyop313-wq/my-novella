import { Component, ElementRef, ViewChild, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AngularNodeViewComponent } from 'ngx-tiptap';
import { CdkMenuModule } from '@angular/cdk/menu';
import { AiPromptSettingsComponent } from '../ai-prompt-settings/ai-prompt-settings.component';
import { AIStateService } from '../../../../core/services/ai-state.service';
import { AiStore } from '../../store/ai.store';
import { ManuscriptProseSaverService } from '../../helpers/manuscript-prose-saver.service';

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
  isLoading = signal(false);

  private aiStore = inject(AiStore);
  private saver = inject(ManuscriptProseSaverService);
  allModels = computed(() => this.aiStore.models());
  searchTerm = signal<string>('');
  activeSubmenuProvider = signal<any | null>(null);

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

  constructor(private aiStateService: AIStateService) {
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

  onModelChange(model: string | null): void {
    this.selectedModel.set(model);
    this.updateAttributes()({ selectedModel: model });
  }

  onSettingsReset(): void {
    this.wordCount.set(500);
    this.pov.set('global');
    this.povCharacter.set(null);
    this.vectorSearch.set('global');

    this.updateAttributes()({
      wordCount: 500,
      pov: 'global',
      povCharacter: null,
      vectorSearch: 'global'
    });
  }

  async onSubmit(): Promise<void> {
    // Prevent multiple submissions while already generating
    if (this.isLoading()) return;

    // Sync any pending paragraph changes to the vector DB before generation
    // so the AI retrieval context reflects the latest manuscript state.
    await this.saver.flushParagraphVectorChanges();

    const text = this.promptText().trim();
    if (text && typeof this.getPos === 'function') {
      // Calculate the position immediately after this prompt component
      const pos: number = this.getPos()() ?? 0;
      const nodeSizePosition: number = this.node().nodeSize + pos;

      // Determine provider and modelId
      const selectedId = this.selectedModel();
      const selectedModelObj = this.allModels().find(m => m.id === selectedId);

      let provider = 'openrouter';
      let modelId: string | undefined = undefined;

      if (selectedModelObj) {
        if (selectedModelObj.source === 'direct') {
          provider = selectedModelObj.provider;
          modelId = selectedModelObj.id.split('/')[1];
        } else {
          provider = 'openrouter';
          modelId = selectedModelObj.id;
        }
      }

      // Create an initial empty paragraph to receive the AI's response
      // Wrap it in aiGeneratedBlock (with addToHistory: false)
      const blockNodeJson = {
        type: 'aiGeneratedBlock',
        attrs: { promptText: text, provider: provider, modelId: modelId || '', isGenerating: true },
        content: [{ type: 'paragraph' }]
      };
      const tr = this.editor().state.tr;
      const node = this.editor().schema.nodeFromJSON(blockNodeJson);
      tr.insert(nodeSizePosition, node);
      tr.setMeta('addToHistory', false);
      this.editor().view.dispatch(tr);

      // +2 to move the cursor inside the newly created paragraph node within the block
      let currentInsertPos = nodeSizePosition + 2;
      this.isLoading.set(true);

      // Buffer to accumulate regular text characters to avoid slow 1-by-1 insertions
      let textBuffer = '';
      // Flag to track consecutive newlines so we only create one paragraph break for multiple \n\n
      let isNewlineSequence = false;

      // Helper function to insert the accumulated buffer into the editor
      const flushBuffer = () => {
        if (textBuffer.length > 0) {
          const beforeSize = this.editor().state.doc.content.size;
          const trInsert = this.editor().state.tr.insertText(textBuffer, currentInsertPos);
          trInsert.setMeta('addToHistory', false);
          this.editor().view.dispatch(trInsert);
          const afterSize = this.editor().state.doc.content.size;
          // Advance the insertion cursor by the exact number of nodes/characters added
          currentInsertPos += (afterSize - beforeSize);
          textBuffer = ''; // Reset buffer after successful insertion
        }
      };



      let hasError = false;
      try {
        // Start streaming the AI response
        await this.aiStateService.generate(text, provider, modelId, (token) => {
          if (token) {
            // Process the incoming chunk of text character by character
            for (let i = 0; i < token.length; i++) {
              const char = token[i];

              // Check for newlines (both Unix \n and Windows \r)
              if (char === '\n' || char === '\r') {
                // Ignore \r completely. Only act when we see \n
                if (char === '\n') {
                  // If we aren't already in the middle of a sequence of newlines
                  if (!isNewlineSequence) {
                    flushBuffer(); // Insert any pending text first
                    const beforeSize = this.editor().state.doc.content.size;

                    // Execute a Tiptap transaction to split the current paragraph node into two
                    const trSplit = this.editor().state.tr.split(currentInsertPos);
                    trSplit.setMeta('addToHistory', false);
                    this.editor().view.dispatch(trSplit);

                    const afterSize = this.editor().state.doc.content.size;
                    currentInsertPos += (afterSize - beforeSize); // Move cursor into the new paragraph
                    isNewlineSequence = true;
                  }
                }
              } else {
                // We hit a normal character. Reset the newline sequence flag and buffer the character.
                isNewlineSequence = false;
                textBuffer += char;
              }
            }
            // Flush the buffer at the end of each token so the user sees the text appearing live
          }
        });
      } catch (err) {
        hasError = true;
        console.error('AI Generation failed in prompt:', err);
      } finally {
        // Ensure any remaining text in the buffer is inserted when the stream finishes
        flushBuffer();
        this.isLoading.set(false);

        if (hasError) {
          // Find the generating block and remove it
          const state = this.editor().state;
          let blockPos: number | null = null;
          let blockSize: number | null = null;

          state.doc.descendants((node, pos) => {
            if (node.type.name === 'aiGeneratedBlock' && node.attrs['isGenerating']) {
              blockPos = pos;
              blockSize = node.nodeSize;
              return false;
            }
            return true;
          });

          if (blockPos !== null && blockSize !== null) {
            const trDel = this.editor().state.tr.delete(blockPos, blockPos + blockSize);
            trDel.setMeta('addToHistory', false);
            this.editor().view.dispatch(trDel);
          }
        } else {
          // Find the generating block
          const state = this.editor().state;
          let blockPos: number | null = null;
          let blockNode: any = null;

          state.doc.descendants((node, pos) => {
            if (node.type.name === 'aiGeneratedBlock' && node.attrs['isGenerating']) {
              blockPos = pos;
              blockNode = node;
              return false;
            }
            return true;
          });

          if (blockPos !== null && blockNode !== null) {
            const finalizedBlockJson = {
              type: 'aiGeneratedBlock',
              attrs: {
                promptText: blockNode.attrs['promptText'] || '',
                provider: blockNode.attrs['provider'] || '',
                modelId: blockNode.attrs['modelId'] || '',
                isGenerating: false
              },
              content: blockNode.content.toJSON()
            };

            const blockNodeSize: number = blockNode.nodeSize;

            // Delete the temporary block (without adding to history)
            const trDel = this.editor().state.tr.delete(blockPos, blockPos + blockNodeSize);
            trDel.setMeta('addToHistory', false);
            this.editor().view.dispatch(trDel);

            // Insert finalized block (with adding to history)
            this.editor().chain().insertContentAt(blockPos, finalizedBlockJson).focus().run();
          }
        }
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
}
