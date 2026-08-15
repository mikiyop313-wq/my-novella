import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
} from '../../../../../shared/models/chat.model';
import { ChatService } from '../services/chat.service';
import { ChatStore } from './chat.store';

function makeThread(overrides: Partial<ChatThreadDto> = {}): ChatThreadDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'New chat',
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

function makeThreadDetail(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    ...makeThread(overrides),
    messages: [makeMessage()],
    ...overrides,
  };
}

describe('ChatStore', () => {
  let store: InstanceType<typeof ChatStore>;
  let chatService: {
    getThreads: ReturnType<typeof vi.fn>;
    getThread: ReturnType<typeof vi.fn>;
    createThread: ReturnType<typeof vi.fn>;
    updateThread: ReturnType<typeof vi.fn>;
    archiveThread: ReturnType<typeof vi.fn>;
    deleteThread: ReturnType<typeof vi.fn>;
    createMessage: ReturnType<typeof vi.fn>;
    updateMessage: ReturnType<typeof vi.fn>;
    deleteMessage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    chatService = {
      getThreads: vi.fn(),
      getThread: vi.fn(),
      createThread: vi.fn(),
      updateThread: vi.fn(),
      archiveThread: vi.fn(),
      deleteThread: vi.fn(),
      createMessage: vi.fn(),
      updateMessage: vi.fn(),
      deleteMessage: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        { provide: ChatService, useValue: chatService },
      ],
    });

    store = TestBed.inject(ChatStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads threads when entering a book and clears stale selected thread', async () => {
    const staleThread = makeThread({ id: 'stale-thread' });
    chatService.createThread.mockResolvedValueOnce(staleThread);
    chatService.getThreads.mockResolvedValueOnce([makeThread()]);

    await store.createThread('book-1');
    await store.enterBook('book-1');

    expect(chatService.getThreads).toHaveBeenCalledWith('book-1', false);
    expect(store.bookId()).toBe('book-1');
    expect(store.threads()).toMatchObject([{ id: 'thread-1' }]);
    expect(store.selectedThread()).toBeNull();
    expect(store.isLoadingThreads()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('opens a thread detail and exposes its messages', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail());

    await store.openThread('thread-1');

    expect(chatService.getThread).toHaveBeenCalledWith('thread-1');
    expect(store.selectedThread()).toMatchObject({ id: 'thread-1' });
    expect(store.messages()).toMatchObject([{ id: 'message-1' }]);
    expect(store.isLoadingThread()).toBe(false);
  });

  it('creates a thread and selects it with an empty message list', async () => {
    const thread = makeThread({ title: 'Scene planning' });
    chatService.createThread.mockResolvedValueOnce(thread);

    const created = await store.createThread('book-1', 'Scene planning');

    expect(created).toBe(thread);
    expect(chatService.createThread).toHaveBeenCalledWith({
      bookId: 'book-1',
      title: 'Scene planning',
    });
    expect(store.threads()).toMatchObject([{ id: 'thread-1', title: 'Scene planning' }]);
    expect(store.selectedThread()).toMatchObject({
      id: 'thread-1',
      messages: [],
    });
    expect(store.isSaving()).toBe(false);
  });

  it('sends a message to the selected thread', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [] }));
    chatService.createMessage.mockResolvedValueOnce(makeMessage({ content: 'Draft this scene' }));

    await store.openThread('thread-1');
    await store.sendMessage('  Draft this scene  ');

    expect(chatService.createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      role: 'user',
      content: 'Draft this scene',
    });
    expect(store.messages()).toMatchObject([{ content: 'Draft this scene' }]);
    expect(store.isSaving()).toBe(false);
  });

  it('creates a thread before sending when no thread is selected', async () => {
    chatService.getThreads.mockResolvedValueOnce([]);
    chatService.createThread.mockResolvedValueOnce(makeThread());
    chatService.createMessage.mockResolvedValueOnce(makeMessage({ content: 'Start here' }));

    await store.enterBook('book-1');
    await store.sendMessage('Start here');

    expect(chatService.createThread).toHaveBeenCalledWith({ bookId: 'book-1' });
    expect(chatService.createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      role: 'user',
      content: 'Start here',
    });
    expect(store.selectedThread()).toMatchObject({
      id: 'thread-1',
      messages: [{ id: 'message-1' }],
    });
  });

  it('updates and deletes messages locally after service success', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail());
    chatService.updateMessage.mockResolvedValueOnce(makeMessage({ content: 'Updated message' }));
    chatService.deleteMessage.mockResolvedValueOnce({ success: true });

    await store.openThread('thread-1');
    await store.updateMessage('message-1', { content: 'Updated message' });
    expect(store.messages()).toMatchObject([{ content: 'Updated message' }]);

    await store.deleteMessage('message-1');
    expect(store.messages()).toEqual([]);
  });

  it('removes archived and deleted threads locally', async () => {
    chatService.getThreads.mockResolvedValueOnce([
      makeThread({ id: 'thread-1' }),
      makeThread({ id: 'thread-2', title: 'Second thread' }),
    ]);
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ id: 'thread-1' }));
    chatService.archiveThread.mockResolvedValueOnce(makeThread({ id: 'thread-1', status: 'archived' }));
    chatService.deleteThread.mockResolvedValueOnce({ success: true });

    await store.enterBook('book-1');
    await store.openThread('thread-1');
    await store.archiveThread('thread-1');
    await store.deleteThread('thread-2');

    expect(store.threads()).toEqual([]);
    expect(store.selectedThread()).toBeNull();
  });

  it('stores errors and resets loading flags when loading threads fails', async () => {
    chatService.getThreads.mockRejectedValueOnce(new Error('Load failed'));

    await store.enterBook('book-1');

    expect(store.threads()).toEqual([]);
    expect(store.error()).toBe('Load failed');
    expect(store.isLoadingThreads()).toBe(false);
  });

  it('stores errors and resets saving flags when sending fails', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [] }));
    chatService.createMessage.mockRejectedValueOnce(new Error('Send failed'));

    await store.openThread('thread-1');
    await store.sendMessage('Hello');

    expect(store.messages()).toEqual([]);
    expect(store.error()).toBe('Send failed');
    expect(store.isSaving()).toBe(false);
  });
});
