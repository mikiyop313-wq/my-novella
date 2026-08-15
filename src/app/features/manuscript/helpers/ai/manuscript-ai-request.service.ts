import { Injectable, inject } from '@angular/core';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import { AiStore } from '../../../../core/store/ai.store';
import { isVectorSearchSetting } from '../../../../shared/models/vector-search.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { resolveAiModelTarget } from '../../../../shared/utils/ai-model-selection';
import { buildAiPrompt, type BuiltAiPrompt } from '../../../../shared/utils/ai-prompt-builder';
import { CodexContextTrieService } from '../../../codex/services/codex-context-trie.service';
import { WorkspaceBookStore } from '../../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../../workspace/workspace.store';
import { ManuscriptStore } from '../../store/manuscript.store';
import {
  findDetectedCodexEntryIdsForPrompt,
  getAutomaticallyIncludedCodexEntryIds,
} from '../../components/ai-prompt/ai-prompt-codex-context';
import { restoreManuscriptContextRefs } from '../../components/ai-prompt/ai-prompt-dropdown-options';
import {
  ManuscriptAiContextService,
  type ManuscriptAiPointOfViewSetting,
} from './manuscript-ai-context.service';

interface ManuscriptPromptSource {
  node: ProseMirrorNode;
  pos: number;
}

export interface PrepareManuscriptAiRequest {
  editor: Editor;
  promptPos: number;
  promptAttrs: Record<string, unknown>;
  userRequest: string;
  contextPromptText: string;
}

export interface PreparedManuscriptAiRequest {
  aiPrompt: BuiltAiPrompt;
  bookId: string;
  modelId: string;
  promptText: string;
  provider: string;
  reasoningMode: boolean;
}

export interface ManuscriptAiModificationText {
  contextPromptText: string;
  userRequest: string;
}

export function buildManuscriptAiModificationText({
  promptText,
  generatedText,
  requestedChange,
}: {
  promptText: string;
  generatedText: string;
  requestedChange: string;
}): ManuscriptAiModificationText {
  return {
    contextPromptText: [promptText, requestedChange].filter(Boolean).join('\n\n'),
    userRequest: [
      `Original request: ${promptText}`,
      `Generated text:\n${generatedText}`,
      `User request to change:\n${requestedChange}`,
    ].join('\n\n'),
  };
}

@Injectable({ providedIn: 'root' })
export class ManuscriptAiRequestService {
  private readonly aiStore = inject(AiStore);
  private readonly codexContext = inject(CodexContextTrieService);
  private readonly manuscriptAiContext = inject(ManuscriptAiContextService);
  private readonly manuscriptStore = inject(ManuscriptStore);
  private readonly toastService = inject(ToastService);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  findPromptSource(editor: Editor, promptId: string): ManuscriptPromptSource | null {
    let source: ManuscriptPromptSource | null = null;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'aiPrompt' && node.attrs['id'] === promptId) {
        source = { node, pos };
        return false;
      }

      return true;
    });

    return source;
  }

  async prepare(request: PrepareManuscriptAiRequest): Promise<PreparedManuscriptAiRequest | null> {
    const promptText = this.readString(request.promptAttrs['promptText']).trim();
    const userRequest = request.userRequest.trim();
    const selectedModelId = this.readString(request.promptAttrs['selectedModel']);
    const selectedModel = this.aiStore.models().find(model => model.id === selectedModelId);

    if (!promptText || !userRequest) {
      this.toastService.error('The original AI prompt is empty.', 'AI Generation');
      return null;
    }

    if (!selectedModel) {
      this.toastService.error('The selected AI model is not available.', 'AI Generation');
      return null;
    }

    if (
      this.codexContext.isLoading()
      || this.codexContext.error()
      || this.codexContext.trie() === null
    ) {
      this.toastService.error('Codex context is not available yet.', 'AI Context');
      return null;
    }

    if (
      this.workspaceBookStore.isLoadingBookHierarchy()
      || this.workspaceBookStore.bookHierarchyError()
    ) {
      this.toastService.error('Manuscript context is not available yet.', 'AI Context');
      return null;
    }

    const bookId = this.workspaceStore.bookId();
    if (!bookId) {
      this.toastService.error('No active book is available.', 'AI Generation');
      return null;
    }

    const entries = this.codexContext.entries();
    const detectedEntryIds = findDetectedCodexEntryIdsForPrompt(
      request.editor.state.doc,
      request.promptPos,
      request.contextPromptText,
      text => this.codexContext.findMatches(text),
    );
    const automaticCodexEntryIds = getAutomaticallyIncludedCodexEntryIds(
      entries,
      detectedEntryIds,
    );

    let storyContext: string;
    try {
      storyContext = await this.manuscriptAiContext.buildContext({
        editor: request.editor,
        promptPos: request.promptPos,
        promptId: this.readString(request.promptAttrs['id']),
        promptText: request.contextPromptText,
        bookId,
        bookTitle: this.workspaceStore.bookTitle(),
        hierarchy: this.manuscriptStore.bookHierarchy(),
        includeFullOutline: request.promptAttrs['includeFullOutline'] === true,
        manuscriptRefs: restoreManuscriptContextRefs(
          request.promptAttrs['contextManuscriptRefs'],
          request.promptAttrs['contextSceneIds'],
        ),
        manualCodexEntryIds: this.readStringArray(request.promptAttrs['contextCodexEntryIds']),
        automaticCodexEntryIds,
        codexEntries: entries,
        wordCount: this.readNumber(request.promptAttrs['wordCount'], 500),
        pointOfView: this.readPointOfView(request.promptAttrs['pov']),
        povCharacterId: this.readNullableString(request.promptAttrs['povCharacter']),
        vectorSearch: isVectorSearchSetting(request.promptAttrs['vectorSearch'])
          ? request.promptAttrs['vectorSearch']
          : 'global',
      });
    } catch (error) {
      console.error('AI context preparation failed:', error);
      this.toastService.error('Could not prepare the selected story context.', 'AI Context');
      return null;
    }

    const { provider, modelId } = resolveAiModelTarget(selectedModel);
    return {
      aiPrompt: buildAiPrompt({
        requestType: 'sceneBeat',
        messages: [
          {
            role: 'user',
            parts: [{ type: 'section', name: 'STORY CONTEXT', content: storyContext }],
          },
          {
            role: 'user',
            parts: [{ type: 'text', content: userRequest }],
          },
        ],
      }),
      bookId,
      modelId,
      promptText,
      provider,
      reasoningMode: request.promptAttrs['reasoningMode'] === true,
    };
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private readNullableString(value: unknown): string | null {
    const text = this.readString(value);
    return text || null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
  }

  private readNumber(value: unknown, defaultValue: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
  }

  private readPointOfView(value: unknown): ManuscriptAiPointOfViewSetting {
    return value === 'first'
      || value === 'second'
      || value === 'third_limited'
      || value === 'third_omni'
      || value === 'global'
      ? value
      : 'global';
  }
}
