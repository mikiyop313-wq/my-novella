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
    error: ReturnType<typeof vi.fn>;
    bookId: ReturnType<typeof vi.fn>;
    selectedThread: ReturnType<typeof vi.fn>;
    isSaving: ReturnType<typeof vi.fn>;
    enterBook: ReturnType<typeof vi.fn>;
    loadThreads: ReturnType<typeof vi.fn>;
    openThread: ReturnType<typeof vi.fn>;
    closeThread: ReturnType<typeof vi.fn>;
    createThread: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    deleteMessage: ReturnType<typeof vi.fn>;
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
      error: vi.fn(() => null),
      bookId: vi.fn(() => currentBookId),
      selectedThread: vi.fn(() => selectedThread),
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
        selectedThread = { ...thread, messages: [] };
        return thread;
      }),
      sendMessage: vi.fn(async () => {
        selectedThread = makeThreadDetail({ messages: [makeMessage()] });
      }),
      deleteMessage: vi.fn(() => Promise.resolve()),
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
    const input = document.createElement('textarea');
    input.value = 'Start here';

    await component.sendPrompt(input);

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Start here');
    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'thread-1'], { replaceUrl: true });
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
});
