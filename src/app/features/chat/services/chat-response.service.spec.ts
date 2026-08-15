import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { type ChatMessageDetailDto, type ChatThreadDetailDto } from '../../../../../shared/models/chat.model';
import { AiStreamService } from '../../../core/services/ai-stream.service';
import { AiStore } from '../../../core/store/ai.store';
import { ToastService } from '../../../shared/services/toast.service';
import { WorkspaceBookStore } from '../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../workspace/workspace.store';
import { ChatStore } from '../store/chat.store';
import { ChatAiContextService } from './chat-ai-context.service';
import { ChatResponseService } from './chat-response.service';

function makeMessage(overrides: Partial<ChatMessageDetailDto> = {}): ChatMessageDetailDto {
  return {
    id: 'user-1',
    threadId: 'thread-1',
    parentMessageId: null,
    branchGroupId: 'user-branch',
    branchOrder: 0,
    role: 'user',
    content: 'Write a scene',
    status: 'complete',
    position: 0,
    modelId: null,
    provider: null,
    inputTokens: null,
    outputTokens: null,
    reasoningSummary: null,
    error: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeThreadDetail(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Draft chat',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    branchSelections: [],
    ...overrides,
  };
}

type ChatStoreMock = {
  messages: ReturnType<typeof vi.fn>;
  visibleMessages: ReturnType<typeof vi.fn>;
  selectedThread: ReturnType<typeof vi.fn>;
  isSaving: ReturnType<typeof vi.fn>;
  updateThread: ReturnType<typeof vi.fn>;
  createAssistantMessage: ReturnType<typeof vi.fn>;
  selectMessageBranch: ReturnType<typeof vi.fn>;
  patchStreamingMessage: ReturnType<typeof vi.fn>;
  updateMessage: ReturnType<typeof vi.fn>;
  deleteMessage: ReturnType<typeof vi.fn>;
  bookId: ReturnType<typeof vi.fn>;
};

describe('ChatResponseService', () => {
  let service: ChatResponseService;
  let messages: ChatMessageDetailDto[];
  let visibleMessages: ChatMessageDetailDto[];
  let selectedThread: ChatThreadDetailDto | null;
  let chatStore: ChatStoreMock;
  let aiStore: {
    models: ReturnType<typeof vi.fn>;
  };
  let aiStreamService: {
    streamText: ReturnType<typeof vi.fn>;
    stopStream: ReturnType<typeof vi.fn>;
  };
  let chatAiContext: {
    buildContext: ReturnType<typeof vi.fn>;
  };
  let toastService: Pick<ToastService, 'error'>;

  const settings = {
    selectedModelId: 'openrouter/test-model',
    reasoningMode: true,
    context: {
      includeFullOutline: false,
      sceneIds: [],
      codexEntryIds: [],
    },
  };

  beforeEach(() => {
    messages = [makeMessage()];
    visibleMessages = messages;
    selectedThread = makeThreadDetail({ messages });

    chatStore = {
      messages: vi.fn(() => messages),
      visibleMessages: vi.fn(() => visibleMessages),
      selectedThread: vi.fn(() => selectedThread),
      isSaving: vi.fn(() => false),
      updateThread: vi.fn(async () => undefined),
      createAssistantMessage: vi.fn(async (data: { parentMessageId?: string | null } = {}) => makeMessage({
        id: 'assistant-1',
        parentMessageId: data.parentMessageId ?? null,
        branchGroupId: 'assistant-branch',
        role: 'assistant',
        content: '',
        status: 'streaming',
        position: 1,
      })),
      selectMessageBranch: vi.fn(async () => true),
      patchStreamingMessage: vi.fn(),
      updateMessage: vi.fn(async () => makeMessage({ id: 'assistant-1', role: 'assistant' })),
      deleteMessage: vi.fn(async () => undefined),
      bookId: vi.fn(() => 'book-1'),
    };
    aiStore = {
      models: vi.fn(() => [
        {
          id: 'openrouter/test-model',
          source: 'openrouter',
          supportsReasoning: true,
        },
        {
          id: 'openai/gpt-4o-mini',
          provider: 'openai',
          source: 'direct',
          supportsReasoning: false,
        },
        {
          id: 'gemini/gemini-pro',
          provider: 'google',
          source: 'direct',
          supportsReasoning: false,
        },
        {
          id: 'ollama/library/model:tag',
          provider: 'ollama',
          source: 'local',
          supportsReasoning: false,
        },
      ]),
    };
    aiStreamService = {
      streamText: vi.fn(async (request: {
        onToken?: (token: string) => void;
        onReasoningUpdate?: (reasoning: string) => void;
      }) => {
        await request.onReasoningUpdate?.('Checking context');
        await request.onToken?.('Draft reply');
        return 'Draft reply';
      }),
      stopStream: vi.fn(async () => undefined),
    };
    chatAiContext = {
      buildContext: vi.fn(async () => null),
    };
    toastService = { error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ChatResponseService,
        { provide: ChatStore, useValue: chatStore },
        { provide: AiStore, useValue: aiStore },
        { provide: AiStreamService, useValue: aiStreamService },
        { provide: ChatAiContextService, useValue: chatAiContext },
        { provide: ToastService, useValue: toastService },
        {
          provide: WorkspaceBookStore,
          useValue: { bookHierarchy: vi.fn(() => []) },
        },
        {
          provide: WorkspaceStore,
          useValue: {
            bookId: vi.fn(() => 'book-1'),
            bookTitle: vi.fn(() => 'Draft Book'),
          },
        },
      ],
    });
    service = TestBed.inject(ChatResponseService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('streams reasoning and response text before persisting the completed assistant message', async () => {
    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'pending-user-1',
      bookId: 'book-1',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      reasoningMode: true,
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Write a scene',
        messages: [{ role: 'user', content: 'Write a scene' }],
      },
    }));
    expect(chatStore.patchStreamingMessage).toHaveBeenCalledWith('assistant-1', {
      content: 'Draft reply',
      reasoningSummary: 'Checking context',
    });
    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'Draft reply',
      status: 'complete',
      reasoningSummary: 'Checking context',
    }));
    expect(service.isGeneratingResponse()).toBe(false);
  });

  it.each([
    ['gemini/gemini-pro', 'gemini', 'gemini-pro'],
    ['ollama/library/model:tag', 'ollama', 'library/model:tag'],
  ])('routes %s through %s without truncating its model ID', async (
    selectedModelId,
    provider,
    modelId,
  ) => {
    await service.generateResponse(messages[0], 'Write a scene', {
      selectedModelId,
      reasoningMode: false,
      context: settings.context,
    });

    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      provider,
      modelId,
    }));
  });

  it('places only the current user message context immediately before its prompt', async () => {
    visibleMessages = [
      makeMessage({ id: 'user-previous', content: 'Previous Mara mention' }),
      makeMessage({ id: 'assistant-previous', role: 'assistant', content: 'Previous reply' }),
      messages[0],
    ];
    chatAiContext.buildContext.mockResolvedValueOnce('Codex context');

    await service.generateResponse(messages[0], 'Write a scene', {
      ...settings,
      context: {
        includeFullOutline: true,
        sceneIds: ['scene-current'],
        codexEntryIds: ['codex-current'],
      },
    });

    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Write a scene',
        messages: [
          { role: 'user', content: 'Previous Mara mention' },
          { role: 'assistant', content: 'Previous reply' },
          {
            role: 'user',
            content: '--- BEGIN STORY CONTEXT ---\n\nCodex context\n\n--- END STORY CONTEXT ---',
          },
          { role: 'user', content: 'Write a scene' },
        ],
      },
    }));
    expect(chatAiContext.buildContext).toHaveBeenCalledWith({
      includeFullOutline: true,
      sceneIds: ['scene-current'],
      codexEntryIds: ['codex-current'],
      bookId: 'book-1',
      bookTitle: 'Draft Book',
      hierarchy: [],
    });
  });

  it('does not start a stream when the composer context cannot be prepared', async () => {
    chatAiContext.buildContext.mockRejectedValueOnce(new Error('Context read failed'));

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(aiStreamService.streamText).not.toHaveBeenCalled();
    expect(chatStore.createAssistantMessage).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Could not prepare the selected story context.',
      'AI Context',
    );
  });

  it('does not prepare context or stream without an active chat book', async () => {
    chatStore.bookId.mockReturnValue(null);

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(chatAiContext.buildContext).not.toHaveBeenCalled();
    expect(aiStreamService.streamText).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'No active book is available.',
      'AI Generation',
    );
  });

  it('generates a concise thread title from the first user message', async () => {
    selectedThread = makeThreadDetail({ bookId: 'thread-book', title: 'New chat', messages });
    aiStreamService.streamText.mockImplementation(async (request: {
      streamId: string;
      onToken?: (token: string) => void;
    }) => {
      if (request.streamId.startsWith('title-')) {
        return '"Moonlit Escape!"';
      }

      await request.onToken?.('Draft reply');
      return 'Draft reply';
    });

    await service.generateResponse(messages[0], 'Write a scene', settings);

    const titleRequest = aiStreamService.streamText.mock.calls
      .map(([request]) => request)
      .find((request) => request.streamId === 'title-user-1');
    expect(titleRequest).toEqual(expect.objectContaining({
      streamId: 'title-user-1',
      bookId: 'thread-book',
      aiPrompt: {
        systemPromptCategory: 'title',
        prompt: 'Write a scene',
        messages: [{ role: 'user', content: 'Write a scene' }],
      },
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      reasoningMode: false,
    }));
    expect(titleRequest).not.toHaveProperty('messages');
    expect(chatStore.updateThread).toHaveBeenCalledWith('thread-1', {
      title: 'Moonlit Escape',
    });
  });

  it('creates and persists an assistant message when the provider only returns final text', async () => {
    aiStreamService.streamText.mockResolvedValueOnce('Final-only reply');

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(chatStore.createAssistantMessage).toHaveBeenCalledTimes(1);
    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'Final-only reply',
      status: 'complete',
    }));
  });

  it('does not create or persist an assistant message when no content is generated', async () => {
    aiStreamService.streamText.mockImplementationOnce(async (request: { onToken?: (token: string) => void }) => {
      await request.onToken?.(' ');
      return '';
    });

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(chatStore.createAssistantMessage).not.toHaveBeenCalled();
    expect(chatStore.patchStreamingMessage).not.toHaveBeenCalled();
    expect(chatStore.updateMessage).not.toHaveBeenCalled();
    expect(chatStore.deleteMessage).not.toHaveBeenCalled();
  });

  it('persists failed streamed responses without creating a duplicate notification path', async () => {
    aiStreamService.streamText.mockImplementationOnce(async (request: { onToken?: (token: string) => void }) => {
      await request.onToken?.('Partial reply');
      throw new Error('Provider failed');
    });

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'Partial reply',
      status: 'failed',
      error: 'Provider failed',
    }));
  });

  it('retries an assistant response as a selected sibling branch', async () => {
    const assistant = makeMessage({
      id: 'assistant-1',
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-branch',
      role: 'assistant',
      content: 'Original reply',
      position: 1,
    });
    messages = [messages[0], assistant];
    visibleMessages = messages;

    await service.retryMessage('assistant-1', settings);

    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-branch',
    }));
    expect(chatStore.selectMessageBranch).toHaveBeenCalledWith('assistant-1');
  });

  it('restores selector IDs for OpenRouter and direct-provider messages', () => {
    expect(service.getLastUsedModelId([
      makeMessage({ role: 'assistant', modelId: 'openrouter/test-model', provider: 'openrouter' }),
    ])).toBe('openrouter/test-model');

    expect(service.getLastUsedModelId([
      makeMessage({ role: 'assistant', modelId: 'gpt-4o-mini', provider: 'openai' }),
    ])).toBe('openai/gpt-4o-mini');
  });

  it('stops an active response through the stream service', async () => {
    let resolveStream!: (value: string) => void;
    aiStreamService.streamText.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveStream = resolve;
    }));

    const response = service.generateResponse(messages[0], 'Write a scene', settings);
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());

    await expect(service.stopResponse()).resolves.toBeNull();
    expect(aiStreamService.stopStream).toHaveBeenCalledWith('pending-user-1');

    resolveStream('');
    await response;
  });
});
