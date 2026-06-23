import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';

import {
  type ChatMessageDetailDto,
  type ChatThreadDetailDto,
  type ChatThreadDto,
} from '../../../../shared/models/chat.model';
import { AiStreamService } from '../../core/services/ai-stream.service';
import { AiStore } from '../../core/store/ai.store';
import { Chat } from './chat';
import { ChatWindowService } from './services/chat-window.service';
import { ChatStore } from './store/chat.store';

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

function makeThread(overrides: Partial<ChatThreadDto> = {}): ChatThreadDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Draft chat',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessageDetailDto> = {}): ChatMessageDetailDto {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    parentMessageId: null,
    branchGroupId: 'branch-1',
    branchOrder: 0,
    role: 'user',
    content: 'Hello',
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

describe('Chat', () => {
  let fixture: ComponentFixture<Chat>;
  let component: Chat;
  let currentBookId: string | null;
  let selectedThread: ChatThreadDetailDto | null;
  let threads: ChatThreadDto[];
  let chatStore: {
    threads: ReturnType<typeof vi.fn>;
    messages: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    bookId: ReturnType<typeof vi.fn>;
    selectedThread: ReturnType<typeof vi.fn>;
    visibleMessages: ReturnType<typeof vi.fn>;
    isSaving: ReturnType<typeof vi.fn>;
    enterBook: ReturnType<typeof vi.fn>;
    loadThreads: ReturnType<typeof vi.fn>;
    openThread: ReturnType<typeof vi.fn>;
    closeThread: ReturnType<typeof vi.fn>;
    createThread: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    createMessageBranch: ReturnType<typeof vi.fn>;
    createAssistantMessage: ReturnType<typeof vi.fn>;
    patchStreamingMessage: ReturnType<typeof vi.fn>;
    updateMessage: ReturnType<typeof vi.fn>;
    deleteMessage: ReturnType<typeof vi.fn>;
    getMessageBranchCount: ReturnType<typeof vi.fn>;
    getMessageBranchIndex: ReturnType<typeof vi.fn>;
    selectMessageBranch: ReturnType<typeof vi.fn>;
    selectAdjacentMessageBranch: ReturnType<typeof vi.fn>;
  };
  let aiStore: {
    models: ReturnType<typeof vi.fn>;
    loadModels: ReturnType<typeof vi.fn>;
  };
  let aiStreamService: {
    streamText: ReturnType<typeof vi.fn>;
    stopStream: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let chatWindowService: {
    openDetachedWindow: ReturnType<typeof vi.fn>;
    getDetachedSession: ReturnType<typeof vi.fn>;
    onDetachedWindowClosed: ReturnType<typeof vi.fn>;
    isBookDetached: ReturnType<typeof vi.fn>;
  };
  let detachedWindowClosedCallback: ((event: { bookId: string; sessionId: string }) => void) | null;
  let detachedBookIds: Set<string>;

  async function createComponent(routeValue: unknown): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [
        { provide: ActivatedRoute, useValue: routeValue },
        { provide: Router, useValue: router },
        { provide: ChatStore, useValue: chatStore },
        { provide: ChatWindowService, useValue: chatWindowService },
        { provide: AiStore, useValue: aiStore },
        { provide: AiStreamService, useValue: aiStreamService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Chat);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    currentBookId = null;
    selectedThread = null;
    threads = [];
    detachedWindowClosedCallback = null;
    detachedBookIds = new Set();
    chatStore = {
      threads: vi.fn(() => threads),
      messages: vi.fn(() => selectedThread?.messages ?? []),
      error: vi.fn(() => null),
      bookId: vi.fn(() => currentBookId),
      selectedThread: vi.fn(() => selectedThread),
      visibleMessages: vi.fn(() => selectedThread?.messages ?? []),
      isSaving: vi.fn(() => false),
      enterBook: vi.fn((bookId: string) => {
        currentBookId = bookId;
        return Promise.resolve();
      }),
      loadThreads: vi.fn((bookId: string) => {
        currentBookId = bookId;
        return Promise.resolve();
      }),
      openThread: vi.fn(async () => {
        await Promise.resolve();
        selectedThread = makeThreadDetail();
      }),
      closeThread: vi.fn(() => {
        selectedThread = null;
      }),
      createThread: vi.fn(async () => {
        const thread = makeThread();
        selectedThread = { ...thread, messages: [], branchSelections: [] };
        return thread;
      }),
      sendMessage: vi.fn(async (content: string) => {
        const message = makeMessage({ content });
        selectedThread = makeThreadDetail({ messages: [message] });
        return message;
      }),
      createMessageBranch: vi.fn(),
      createAssistantMessage: vi.fn(async (data: {
        parentMessageId?: string | null;
        provider?: string | null;
        modelId?: string | null;
      } = {}) => {
        const message = makeMessage({
          id: 'assistant-1',
          parentMessageId: data.parentMessageId ?? null,
          branchGroupId: 'branch-2',
          role: 'assistant',
          content: '',
          status: 'streaming',
          position: selectedThread?.messages.length ?? 1,
          provider: data.provider ?? null,
          modelId: data.modelId ?? null,
        });
        selectedThread = {
          ...(selectedThread ?? makeThreadDetail({ messages: [] })),
          messages: [...(selectedThread?.messages ?? []), message],
        };
        return message;
      }),
      patchStreamingMessage: vi.fn((id: string, data: Partial<ChatMessageDetailDto>) => {
        if (!selectedThread) return;

        selectedThread = {
          ...selectedThread,
          messages: selectedThread.messages.map((message) => (
            message.id === id ? { ...message, ...data } : message
          )),
        };
      }),
      updateMessage: vi.fn(async (id: string, data: Partial<ChatMessageDetailDto>) => {
        if (!selectedThread) return null;

        let updated: ChatMessageDetailDto | null = null;
        selectedThread = {
          ...selectedThread,
          messages: selectedThread.messages.map((message) => {
            if (message.id !== id) return message;

            updated = { ...message, ...data };
            return updated;
          }),
        };
        return updated;
      }),
      deleteMessage: vi.fn(() => Promise.resolve()),
      getMessageBranchCount: vi.fn((message: ChatMessageDetailDto) => (
        selectedThread?.messages.filter((item) => item.branchGroupId === message.branchGroupId).length ?? 1
      )),
      getMessageBranchIndex: vi.fn((message: ChatMessageDetailDto) => {
        const branches = selectedThread?.messages.filter((item) => item.branchGroupId === message.branchGroupId) ?? [];
        const index = branches.findIndex((item) => item.id === message.id);
        return index === -1 ? 1 : index + 1;
      }),
      selectMessageBranch: vi.fn(() => Promise.resolve(true)),
      selectAdjacentMessageBranch: vi.fn(() => Promise.resolve()),
    };
    aiStore = {
      models: vi.fn(() => [
        {
          id: 'openrouter/test-model',
          name: 'Test Model',
          provider: 'test',
          source: 'openrouter',
          supportsReasoning: true,
        },
      ]),
      loadModels: vi.fn(),
    };
    aiStreamService = {
      streamText: vi.fn(async (request: { onToken?: (token: string) => void }) => {
        request.onToken?.('AI reply');
        return 'AI reply';
      }),
      stopStream: vi.fn(() => Promise.resolve()),
    };
    router = {
      navigate: vi.fn(() => Promise.resolve(true)),
    };
    chatWindowService = {
      openDetachedWindow: vi.fn(({ bookId }: { bookId: string }) => {
        detachedBookIds.add(bookId);
        return Promise.resolve('session-1');
      }),
      getDetachedSession: vi.fn(),
      onDetachedWindowClosed: vi.fn((callback: (event: { bookId: string; sessionId: string }) => void) => {
        detachedWindowClosedCallback = callback;
        return () => {
          detachedWindowClosedCallback = null;
        };
      }),
      isBookDetached: vi.fn((bookId: string | null) => !!bookId && detachedBookIds.has(bookId)),
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('opens a detached chat window for the current book and thread', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    component.selectedThreadId = 'thread-1';
    await component.detachChat();

    expect(chatStore.enterBook).toHaveBeenCalledWith('book-1');
    expect(chatWindowService.openDetachedWindow).toHaveBeenCalledWith({
      bookId: 'book-1',
      selectedThreadId: 'thread-1',
    });
    expect(component.isChatOpenInDetachedWindow()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detached-window-state').hidden).toBe(false);
  });

  it('focuses the detached chat window from the main chat state page', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    component.selectedThreadId = 'thread-1';
    await component.detachChat();
    fixture.detectChanges();
    chatWindowService.openDetachedWindow.mockClear();

    const focusButton = fixture.debugElement.query(By.css('.focus-window-btn'));
    focusButton.triggerEventHandler('click');
    await fixture.whenStable();

    expect(chatWindowService.openDetachedWindow).toHaveBeenCalledWith({
      bookId: 'book-1',
      selectedThreadId: 'thread-1',
    });
  });

  it('clears the main detached state when the detached chat window closes', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    component.selectedThreadId = 'thread-1';
    await component.detachChat();
    fixture.detectChanges();

    expect(component.isChatOpenInDetachedWindow()).toBe(true);

    detachedWindowClosedCallback?.({ bookId: 'book-1', sessionId: 'session-1' });
    fixture.detectChanges();

    expect(component.isChatOpenInDetachedWindow()).toBe(false);
    expect(fixture.nativeElement.querySelector('.detached-window-state').hidden).toBe(true);
  });

  it('restores the main detached state after leaving and returning to chat', async () => {
    const routeValue = {
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    };
    await createComponent(routeValue);

    component.selectedThreadId = 'thread-1';
    await component.detachChat();
    fixture.detectChanges();

    expect(component.isChatOpenInDetachedWindow()).toBe(true);

    fixture.destroy();
    TestBed.resetTestingModule();
    selectedThread = null;

    await createComponent(routeValue);

    expect(chatWindowService.isBookDetached).toHaveBeenCalledWith('book-1');
    expect(component.isChatOpenInDetachedWindow()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detached-window-state').hidden).toBe(false);
  });

  it('routes the thread picker detach request through the chat component', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    const detachSpy = vi.spyOn(component, 'detachChat').mockResolvedValue(undefined);

    const threadList = fixture.debugElement.query(By.css('app-chat-threads'));
    threadList.triggerEventHandler('detachRequested');

    expect(detachSpy).toHaveBeenCalled();
  });

  it('navigates to the selected thread from the thread list route', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      paramMap: of(convertToParamMap({})),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    await component.selectThread('thread-1');

    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'thread-1'], { replaceUrl: false });
  });

  it('opens a thread from the thread route parameter', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    expect(chatStore.openThread).toHaveBeenCalledWith('thread-1');
    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBe('thread-1');
  });

  it('restores the last model used in an opened thread', async () => {
    chatStore.openThread.mockImplementation(async () => {
      selectedThread = makeThreadDetail({
        messages: [
          makeMessage({ id: 'user-1' }),
          makeMessage({
            id: 'assistant-1',
            parentMessageId: 'user-1',
            role: 'assistant',
            position: 1,
            modelId: 'openrouter/test-model',
            provider: 'openrouter',
          }),
        ],
      });
    });

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    await Promise.resolve();

    expect(component.selectedModelId()).toBe('openrouter/test-model');
  });

  it('starts an unsaved new chat without creating a thread', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      paramMap: of(convertToParamMap({})),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    await component.startNewConversation();

    expect(chatStore.closeThread).toHaveBeenCalled();
    expect(chatStore.createThread).not.toHaveBeenCalled();
    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'new-chat'], { replaceUrl: false });
  });

  it('replaces the current thread history entry when starting a new chat from a thread', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    selectedThread = makeThreadDetail({ messages: [makeMessage()] });
    router.navigate.mockClear();

    await component.startNewConversation();

    expect(chatStore.createThread).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'new-chat'], { replaceUrl: true });
  });

  it('opens the new chat route without a selected thread', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBeNull();
    expect(chatStore.openThread).not.toHaveBeenCalled();
  });

  it('navigates from new chat to the created thread after the first message', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    router.navigate.mockClear();
    component.selectedModelId.set('openrouter/test-model');
    const input = document.createElement('textarea');
    input.value = 'Start here';

    await component.sendPrompt(input);

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Start here');
    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'thread-1'], { replaceUrl: true });
  });

  it('streams an AI response after saving the user message', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    component.selectedModelId.set('openrouter/test-model');
    const input = document.createElement('textarea');
    input.value = 'Start here';

    await component.sendPrompt(input);

    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith({
      parentMessageId: 'message-1',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
    });
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'pending-message-1',
      prompt: 'Start here',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      messages: [{ role: 'user', content: 'Start here' }],
    }));
    expect(chatStore.patchStreamingMessage).toHaveBeenCalledWith('assistant-1', {
      content: 'AI reply',
    });
    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'AI reply',
      status: 'complete',
    }));
  });

  it('creates and selects an edited user-message branch before generating a response', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    const original = makeMessage({ id: 'user-1', content: 'Original prompt' });
    const edited = makeMessage({
      id: 'user-2',
      content: 'Edited prompt',
      branchOrder: 1,
    });
    selectedThread = makeThreadDetail({ messages: [original] });
    chatStore.createMessageBranch.mockResolvedValueOnce(edited);

    component.editMessage('user-1');
    await component.saveMessageEdit('user-1', '  Edited prompt  ');

    expect(chatStore.createMessageBranch).toHaveBeenCalledWith('user-1', 'Edited prompt');
    expect(chatStore.selectMessageBranch).toHaveBeenCalledWith('user-2');
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Edited prompt',
    }));
  });

  it('treats an unchanged user-message edit as an assistant retry', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    const user = makeMessage({ id: 'user-1', content: 'Keep this prompt' });
    const assistant = makeMessage({
      id: 'assistant-1',
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
      role: 'assistant',
      content: 'Original response',
      position: 1,
    });
    selectedThread = makeThreadDetail({ messages: [user, assistant] });

    component.editMessage('user-1');
    await component.saveMessageEdit('user-1', 'Keep this prompt');

    expect(chatStore.createMessageBranch).not.toHaveBeenCalled();
    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith({
      parentMessageId: 'user-1',
      provider: 'openrouter',
      modelId: null,
      branchGroupId: 'assistant-group',
    });
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Keep this prompt',
      messages: [{ role: 'user', content: 'Keep this prompt' }],
    }));
  });

  it('retries an assistant response as a selected sibling branch', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    const user = makeMessage({ id: 'user-1', content: 'Prompt' });
    const assistant = makeMessage({
      id: 'assistant-1',
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
      role: 'assistant',
      content: 'Original response',
      position: 1,
    });
    selectedThread = makeThreadDetail({ messages: [user, assistant] });

    await component.retryMessage('assistant-1');

    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
    }));
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Prompt',
      messages: [{ role: 'user', content: 'Prompt' }],
    }));
  });

  it('creates only one retry branch when streaming finishes before branch creation resolves', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    const user = makeMessage({ id: 'user-1', content: 'Prompt' });
    const assistant = makeMessage({
      id: 'assistant-1',
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
      role: 'assistant',
      content: 'Original response',
      position: 1,
    });
    selectedThread = makeThreadDetail({ messages: [user, assistant] });

    let resolveAssistant!: (message: ChatMessageDetailDto) => void;
    chatStore.createAssistantMessage.mockImplementationOnce(() => new Promise<ChatMessageDetailDto>((resolve) => {
      resolveAssistant = resolve;
    }));
    aiStreamService.streamText.mockImplementationOnce(async (request: { onToken?: (token: string) => void }) => {
      request.onToken?.('Retry reply');
      return 'Retry reply';
    });

    const retry = component.retryMessage('assistant-1');
    await vi.waitFor(() => expect(chatStore.createAssistantMessage).toHaveBeenCalledTimes(1));
    resolveAssistant(makeMessage({
      id: 'assistant-2',
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
      role: 'assistant',
      content: '',
      status: 'streaming',
      position: 1,
      branchOrder: 1,
    }));
    await retry;

    expect(chatStore.createAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the response spinner visible until streaming completes', async () => {
    let resolveStream!: (value: string) => void;
    aiStreamService.streamText.mockImplementationOnce((request: {
      onToken?: (token: string) => void;
      onReasoningUpdate?: (reasoning: string) => void;
    }) => {
      request.onReasoningUpdate?.('Inspecting the prompt');
      request.onToken?.('Partial reply');
      return new Promise<string>((resolve) => {
        resolveStream = resolve;
      });
    });

    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    component.selectedModelId.set('openrouter/test-model');
    const input = document.createElement('textarea');
    input.value = 'Start here';

    const sendPromise = component.sendPrompt(input);
    await vi.waitFor(() => {
      expect(aiStreamService.streamText).toHaveBeenCalled();
    });
    fixture.detectChanges(false);

    expect(fixture.nativeElement.querySelector('.message-spinner')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Partial reply');
    expect(fixture.nativeElement.querySelector('.message-reasoning-toggle')).not.toBeNull();
    expect((fixture.nativeElement.querySelector('.message-reasoning-content') as HTMLElement)
      .getAttribute('aria-hidden')).toBe('true');

    resolveStream('Partial reply');
    await sendPromise;
    fixture.detectChanges(false);

    expect(fixture.nativeElement.querySelector('.message-spinner')).toBeNull();
  });

  it('renders assistant reasoning as a collapsed, accessible disclosure', async () => {
    selectedThread = makeThreadDetail({
      messages: [makeMessage({
        id: 'assistant-with-reasoning',
        role: 'assistant',
        content: 'Final answer',
        reasoningSummary: 'First, inspect the prompt.\nThen, answer it.',
      })],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });

    const toggle = fixture.nativeElement.querySelector('.message-reasoning-toggle') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Thinking');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((fixture.nativeElement.querySelector('.message-reasoning-content') as HTMLElement)
      .getAttribute('aria-hidden')).toBe('true');

    toggle.click();
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector('.message-reasoning-content') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.classList.contains('is-expanded')).toBe(true);
    expect(content.id).toBe('chat-message-reasoning-assistant-with-reasoning');
    expect(content.textContent).toContain('First, inspect the prompt.\nThen, answer it.');
  });

  it('does not render a reasoning disclosure when no reasoning is available', async () => {
    selectedThread = makeThreadDetail({
      messages: [makeMessage({ id: 'assistant-without-reasoning', role: 'assistant', content: 'Final answer' })],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });

    expect(fixture.nativeElement.querySelector('.message-reasoning')).toBeNull();
  });

  it('disables sending until a model is selected', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });

    const sendButton = fixture.nativeElement.querySelector('.send-btn') as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);

    component.selectedModelId.set('openrouter/test-model');
    fixture.detectChanges();

    expect(sendButton.disabled).toBe(false);
  });

  it('turns the send control into a stop control while a response is generating', async () => {
    let resolveStream!: (value: string) => void;
    aiStreamService.streamText.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveStream = resolve;
    }));

    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
    const input = document.createElement('textarea');
    input.value = 'Start here';

    const sendPromise = component.sendPrompt(input);
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());
    fixture.detectChanges();

    const sendButton = fixture.nativeElement.querySelector('.send-btn') as HTMLButtonElement;
    expect(sendButton.getAttribute('aria-label')).toBe('Stop generating');
    expect(sendButton.querySelector('rect')).not.toBeNull();

    await component.handleSendOrStop(input);
    expect(aiStreamService.stopStream).toHaveBeenCalledWith('pending-message-1');

    resolveStream('');
    await sendPromise;
  });

  it('pauses and resumes streaming auto-scroll based on the chat scroll position', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });

    const chatBody = fixture.nativeElement.querySelector('.chat-body') as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(chatBody, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 600 },
      scrollTo: { configurable: true, value: scrollTo },
    });

    component.isGeneratingResponse.set(true);
    component['requestAutoScroll']();
    fixture.detectChanges();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_000, behavior: 'auto' });

    chatBody.scrollTop = 200;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(false);
    expect(fixture.nativeElement.querySelector('.scroll-to-bottom-btn')).not.toBeNull();

    chatBody.scrollTop = 600;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(true);
    expect(fixture.nativeElement.querySelector('.scroll-to-bottom-btn')).toBeNull();

    chatBody.scrollTop = 200;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: 'smooth' });
    expect(component.isAutoScrollEnabled()).toBe(true);
    expect(fixture.nativeElement.querySelector('.scroll-to-bottom-btn')).toBeNull();

    component.isGeneratingResponse.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.scroll-to-bottom-btn')).toBeNull();
  });

  it('keeps the created thread selected when the thread route initializes after sending', async () => {
    currentBookId = 'book-1';
    selectedThread = makeThreadDetail({ messages: [makeMessage()] });

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    expect(chatStore.enterBook).not.toHaveBeenCalled();
    expect(chatStore.loadThreads).toHaveBeenCalledWith('book-1');
    expect(chatStore.closeThread).not.toHaveBeenCalled();
    expect(selectedThread?.id).toBe('thread-1');
  });

  it('loads detached sessions and hides detach buttons in detached mode', async () => {
    chatWindowService.getDetachedSession.mockResolvedValueOnce({
      sessionId: 'session-1',
      bookId: 'book-1',
      selectedThreadId: 'thread-1',
    });

    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ sessionId: 'session-1' }),
      },
      parent: null,
    });

    expect(component.isDetachedMode).toBe(true);
    expect(chatWindowService.getDetachedSession).toHaveBeenCalledWith('session-1');
    expect(chatStore.enterBook).toHaveBeenCalledWith('book-1');
    expect(chatStore.openThread).toHaveBeenCalledWith('thread-1');
    expect(fixture.nativeElement.querySelector('.detach-btn')).toBeNull();
  });

  it('starts a new detached chat when detached without a selected thread', async () => {
    threads = [
      makeThread({
        id: 'older-thread',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      }),
      makeThread({
        id: 'newer-thread',
        createdAt: '2026-01-02T00:00:00.000Z',
        lastEditedAt: '2026-01-02T00:00:00.000Z',
      }),
    ];
    chatWindowService.getDetachedSession.mockResolvedValueOnce({
      sessionId: 'session-1',
      bookId: 'book-1',
      selectedThreadId: null,
    });

    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ sessionId: 'session-1' }),
      },
      parent: null,
    });

    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBeNull();
    expect(chatStore.closeThread).toHaveBeenCalled();
    expect(chatStore.openThread).not.toHaveBeenCalled();
  });

  it('starts a new detached chat with the sidebar when no threads exist', async () => {
    chatWindowService.getDetachedSession.mockResolvedValueOnce({
      sessionId: 'session-1',
      bookId: 'book-1',
      selectedThreadId: null,
    });

    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ sessionId: 'session-1' }),
      },
      parent: null,
    });

    expect(component.isDetachedMode).toBe(true);
    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBeNull();
    expect(chatStore.closeThread).toHaveBeenCalled();
    expect(chatStore.openThread).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.chat-threads-container.is-sidebar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.detached-empty-state')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sidebar-empty-state')).toBeNull();
  });

  it('deletes messages from the selected thread through the store', async () => {
    selectedThread = makeThreadDetail({ messages: [makeMessage()] });

    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });

    await component.deleteMessage('message-1');
    await component.deleteMessage('missing-message');

    expect(chatStore.deleteMessage).toHaveBeenCalledTimes(1);
    expect(chatStore.deleteMessage).toHaveBeenCalledWith('message-1');
  });

  it('renders branch index and routes branch arrows through the store', async () => {
    selectedThread = makeThreadDetail({
      messages: [
        makeMessage({ id: 'message-1', branchGroupId: 'branch-1', branchOrder: 0 }),
        makeMessage({ id: 'message-2', branchGroupId: 'branch-1', branchOrder: 1 }),
      ],
      branchSelections: [
        {
          threadId: 'thread-1',
          branchGroupId: 'branch-1',
          selectedMessageId: 'message-1',
        },
      ],
    });
    chatStore.visibleMessages.mockImplementation(() => selectedThread?.messages.slice(0, 1) ?? []);
    chatStore.openThread.mockResolvedValueOnce(undefined);

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: {
          paramMap: convertToParamMap({ bookId: 'book-1' }),
        },
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.branch-index')?.textContent.trim()).toBe('1/2');

    const branchButtons = fixture.debugElement.queryAll(By.css('.branch-btn'));
    branchButtons[1].triggerEventHandler('click');
    await fixture.whenStable();

    expect(chatStore.selectAdjacentMessageBranch).toHaveBeenCalledWith('message-1', 1);
  });
});
