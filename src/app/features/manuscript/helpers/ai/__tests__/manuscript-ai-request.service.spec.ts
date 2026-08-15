import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Editor } from '@tiptap/core';
import { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { vi } from 'vitest';

import { AiStore } from '../../../../../core/store/ai.store';
import { ToastService } from '../../../../../shared/services/toast.service';
import { CodexContextTrieService } from '../../../../codex/services/codex-context-trie.service';
import { WorkspaceBookStore } from '../../../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../../../workspace/workspace.store';
import { ManuscriptStore } from '../../../store/manuscript.store';
import { ManuscriptAiContextService } from '../manuscript-ai-context.service';
import {
  ManuscriptAiRequestService,
  buildManuscriptAiModificationText,
  extractGeneratedProse,
} from '../manuscript-ai-request.service';

describe('ManuscriptAiRequestService', () => {
  const buildContext = vi.fn();
  const toastError = vi.fn();
  const models = signal([{
    id: 'anthropic/current-model',
    name: 'Current model',
    provider: 'anthropic',
    source: 'direct' as const,
  }]);
  const codexEntries = signal([{
    id: 'codex-1',
    name: 'Mara',
    status: 'active',
    trackingSetting: 'include_when_detected',
  } as any]);

  beforeEach(() => {
    buildContext.mockReset().mockResolvedValue('Fresh story context');
    toastError.mockReset();

    TestBed.configureTestingModule({
      providers: [
        ManuscriptAiRequestService,
        { provide: AiStore, useValue: { models } },
        {
          provide: CodexContextTrieService,
          useValue: {
            entries: codexEntries,
            error: signal(null),
            findMatches: vi.fn((text: string) => text.includes('Mara')
              ? [{ value: { entryId: 'codex-1' } }]
              : []),
            isLoading: signal(false),
            trie: signal({}),
          },
        },
        { provide: ManuscriptAiContextService, useValue: { buildContext } },
        { provide: ManuscriptStore, useValue: { bookHierarchy: signal([]) } },
        {
          provide: WorkspaceBookStore,
          useValue: {
            bookHierarchyError: signal(null),
            isLoadingBookHierarchy: signal(false),
          },
        },
        {
          provide: WorkspaceStore,
          useValue: {
            bookId: signal('book-1'),
            bookTitle: signal('Novel'),
          },
        },
        { provide: ToastService, useValue: { error: toastError } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('prepares structured story context with the prompt current settings', async () => {
    const service = TestBed.inject(ManuscriptAiRequestService);
    const editor = createEditorStub();

    const prepared = await service.prepare({
      editor,
      promptPos: 12,
      promptAttrs: {
        id: 'prompt-1',
        promptText: 'Continue the scene.',
        selectedModel: 'anthropic/current-model',
        reasoningMode: true,
        wordCount: 900,
        pov: 'first',
        povCharacter: 'codex-1',
        vectorSearch: 'enabled',
        includeFullOutline: true,
        contextManuscriptRefs: ['scene:scene-1'],
        contextCodexEntryIds: ['codex-manual'],
      },
      contextPromptText: 'Continue Mara\'s scene with the new direction.',
      requestMessages: [{
        role: 'user',
        parts: [{ type: 'text', content: 'Continue the scene.' }],
      }],
    });

    expect(buildContext).toHaveBeenCalledWith(expect.objectContaining({
      promptId: 'prompt-1',
      promptText: 'Continue Mara\'s scene with the new direction.',
      wordCount: 900,
      pointOfView: 'first',
      povCharacterId: 'codex-1',
      vectorSearch: 'enabled',
      includeFullOutline: true,
      manualCodexEntryIds: ['codex-manual'],
      automaticCodexEntryIds: new Set(['codex-1']),
    }));
    expect(prepared).toEqual(expect.objectContaining({
      bookId: 'book-1',
      modelId: 'current-model',
      promptText: 'Continue the scene.',
      provider: 'anthropic',
      reasoningMode: true,
    }));
    expect(prepared?.aiPrompt.messages).toEqual([
      {
        role: 'user',
        content: [
          '--- BEGIN STORY CONTEXT ---',
          'Fresh story context',
          '--- END STORY CONTEXT ---',
        ].join('\n\n'),
      },
      { role: 'user', content: 'Continue the scene.' },
    ]);
  });

  it('prepares modification messages in revision conversation order', async () => {
    const service = TestBed.inject(ManuscriptAiRequestService);
    const modification = buildManuscriptAiModificationText({
      promptText: 'Write the arrival without ending the scene.',
      generatedText: 'Mara entered the city.\n\nThe gates closed behind her.',
      requestedChange: 'End the scene when Mara hears a scream.',
    });

    const prepared = await service.prepare({
      editor: createEditorStub(),
      promptPos: 12,
      promptAttrs: {
        id: 'prompt-1',
        promptText: 'Write the arrival without ending the scene.',
        selectedModel: 'anthropic/current-model',
      },
      contextPromptText: modification.contextPromptText,
      requestMessages: modification.requestMessages,
    });

    expect(buildContext).toHaveBeenCalledWith(expect.objectContaining({
      promptText: [
        'Write the arrival without ending the scene.',
        'End the scene when Mara hears a scream.',
      ].join('\n\n'),
    }));
    expect(prepared?.aiPrompt.messages).toEqual([
      {
        role: 'user',
        content: [
          '--- BEGIN STORY CONTEXT ---',
          'Fresh story context',
          '--- END STORY CONTEXT ---',
        ].join('\n\n'),
      },
      { role: 'user', content: 'Write the arrival without ending the scene.' },
      {
        role: 'assistant',
        content: 'Mara entered the city.\n\nThe gates closed behind her.',
      },
      {
        role: 'user',
        content: [
          'Revise the previous generated prose according to the request below. The revision request takes precedence over any conflicting instruction in the original request. Return the complete revised prose only.',
          'Revision request:\nEnd the scene when Mara hears a scream.',
        ].join('\n\n'),
      },
    ]);
  });

  it('returns no request when fresh context preparation fails', async () => {
    buildContext.mockRejectedValueOnce(new Error('Context failed'));
    const service = TestBed.inject(ManuscriptAiRequestService);

    const prepared = await service.prepare({
      editor: createEditorStub(),
      promptPos: 12,
      promptAttrs: {
        id: 'prompt-1',
        promptText: 'Continue.',
        selectedModel: 'anthropic/current-model',
      },
      contextPromptText: 'Continue.',
      requestMessages: [{
        role: 'user',
        parts: [{ type: 'text', content: 'Continue.' }],
      }],
    });

    expect(prepared).toBeNull();
    expect(toastError).toHaveBeenCalledWith(
      'Could not prepare the selected story context.',
      'AI Context',
    );
  });

  it('finds the source prompt by the generated response ID', () => {
    const service = TestBed.inject(ManuscriptAiRequestService);
    const promptNode = { type: { name: 'aiPrompt' }, attrs: { id: 'prompt-1' } };
    const editor = {
      state: {
        doc: {
          descendants: (callback: (node: any, pos: number) => boolean) => {
            callback({ type: { name: 'paragraph' }, attrs: {} }, 0);
            callback(promptNode, 8);
          },
        },
      },
    } as unknown as Editor;

    expect(service.findPromptSource(editor, 'prompt-1')).toEqual({
      node: promptNode,
      pos: 8,
    });
    expect(service.findPromptSource(editor, 'missing')).toBeNull();
  });
});

describe('manuscript AI modification helpers', () => {
  it('builds a structured revision conversation and focused context lookup text', () => {
    expect(buildManuscriptAiModificationText({
      promptText: 'Write the arrival.',
      generatedText: 'Mara entered the city.',
      requestedChange: 'Make the city hostile.',
    })).toEqual({
      contextPromptText: 'Write the arrival.\n\nMake the city hostile.',
      requestMessages: [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Write the arrival.' }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Mara entered the city.' }],
        },
        {
          role: 'user',
          parts: [{
            type: 'text',
            content: [
              'Revise the previous generated prose according to the request below. The revision request takes precedence over any conflicting instruction in the original request. Return the complete revised prose only.',
              'Revision request:\nMake the city hostile.',
            ].join('\n\n'),
          }],
        },
      ],
    });
  });

  it('extracts generated prose with blank lines between block nodes', () => {
    const schema = new Schema({
      nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block' },
        text: { group: 'inline' },
      },
    });
    const node = ProseMirrorNode.fromJSON(schema, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
      ],
    });

    expect(extractGeneratedProse(node)).toBe('First paragraph.\n\nSecond paragraph.');
  });
});

function createEditorStub(): Editor {
  return {
    state: {
      doc: {
        forEach: vi.fn(),
      },
    },
  } as unknown as Editor;
}
