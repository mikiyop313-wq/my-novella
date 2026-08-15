import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { type ChatMessageDetailDto } from '../../../../../shared/models/chat.model';
import { AiStreamService } from '../../../core/services/ai-stream.service';
import { AiStore } from '../../../core/store/ai.store';
import { ChatStore } from '../store/chat.store';
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
    sceneRefs: [],
    codexRefs: [],
    ...overrides,
  };
}

type ChatStoreMock = {
  messages: ReturnType<typeof vi.fn>;
  visibleMessages: ReturnType<typeof vi.fn>;
  isSaving: ReturnType<typeof vi.fn>;
  createAssistantMessage: ReturnType<typeof vi.fn>;
  selectMessageBranch: ReturnType<typeof vi.fn>;
  patchStreamingMessage: ReturnType<typeof vi.fn>;
  updateMessage: ReturnType<typeof vi.fn>;
  deleteMessage: ReturnType<typeof vi.fn>;
};

describe('ChatResponseService', () => {
  let service: ChatResponseService;
  let messages: ChatMessageDetailDto[];
  let visibleMessages: ChatMessageDetailDto[];
  let chatStore: ChatStoreMock;
  let aiStore: {
    models: ReturnType<typeof vi.fn>;
  };
  let aiStreamService: {
    streamText: ReturnType<typeof vi.fn>;
    stopStream: ReturnType<typeof vi.fn>;
  };

  const settings = {
    selectedModelId: 'openrouter/test-model',
    reasoningMode: true,
  };

  beforeEach(() => {
    messages = [makeMessage()];
    visibleMessages = messages;

    chatStore = {
      messages: vi.fn(() => messages),
      visibleMessages: vi.fn(() => visibleMessages),
      isSaving: vi.fn(() => false),
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

    TestBed.configureTestingModule({
      providers: [
        ChatResponseService,
        { provide: ChatStore, useValue: chatStore },
        { provide: AiStore, useValue: aiStore },
        { provide: AiStreamService, useValue: aiStreamService },
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
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      reasoningMode: true,
      messages: [{ role: 'user', content: 'Write a scene' }],
    }));
    expect(chatStore.patchStreamingMessage).toHaveBeenCalledWith('assistant-1', {
      reasoningSummary: 'Checking context',
    });
    expect(chatStore.patchStreamingMessage).toHaveBeenCalledWith('assistant-1', {
      content: 'Draft reply',
    });
    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'Draft reply',
      status: 'complete',
      reasoningSummary: 'Checking context',
    }));
    expect(service.isGeneratingResponse()).toBe(false);
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

  it('removes an empty streamed assistant placeholder', async () => {
    aiStreamService.streamText.mockImplementationOnce(async (request: { onToken?: (token: string) => void }) => {
      await request.onToken?.(' ');
      return '';
    });

    await service.generateResponse(messages[0], 'Write a scene', settings);

    expect(chatStore.deleteMessage).toHaveBeenCalledWith('assistant-1');
    expect(chatStore.updateMessage).not.toHaveBeenCalled();
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
