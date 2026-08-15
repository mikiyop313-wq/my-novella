import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import {
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
} from '../../../../../shared/models/chat.model';
import { ToastService } from '../../../shared/services/toast.service';
import { ChatService } from '../services/chat.service';
import { ChatStore } from './chat.store';

function makeThread(overrides: Partial<ChatThreadDto> = {}): ChatThreadDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'New chat',
    status: 'active',
    lastModelId: null,
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
    ...overrides,
  };
}

function makeThreadDetail(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    ...makeThread(overrides),
    messages: [makeMessage()],
    branchSelections: [],
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
    selectBranch: ReturnType<typeof vi.fn>;
  };
  let toastService: Pick<ToastService, 'error'>;

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
      selectBranch: vi.fn(),
    };
    toastService = { error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        { provide: ChatService, useValue: chatService },
        { provide: ToastService, useValue: toastService },
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

  it('persists and locally patches the selected model on a thread', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ lastModelId: null }));
    chatService.updateThread.mockResolvedValueOnce(makeThread({
      lastModelId: 'openrouter/test-model',
    }));

    await store.openThread('thread-1');
    await store.updateThread('thread-1', { lastModelId: 'openrouter/test-model' });

    expect(chatService.updateThread).toHaveBeenCalledWith('thread-1', {
      lastModelId: 'openrouter/test-model',
    });
    expect(store.selectedThread()?.lastModelId).toBe('openrouter/test-model');
  });

  it('sends a message to the selected thread', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [] }));
    chatService.createMessage.mockResolvedValueOnce(makeMessage({ content: 'Draft this scene' }));

    await store.openThread('thread-1');
    const sent = await store.sendMessage('  Draft this scene  ');

    expect(chatService.createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      parentMessageId: null,
      branchGroupId: expect.any(String),
      branchOrder: 0,
      role: 'user',
      content: 'Draft this scene',
    });
    expect(sent).toMatchObject({ content: 'Draft this scene' });
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
      parentMessageId: null,
      branchGroupId: expect.any(String),
      branchOrder: 0,
      role: 'user',
      content: 'Start here',
    });
    expect(store.selectedThread()).toMatchObject({
      id: 'thread-1',
      messages: [{ id: 'message-1' }],
    });
  });

  it('creates and locally patches a streaming assistant message', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [] }));
    chatService.createMessage.mockResolvedValueOnce(makeMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      position: 0,
      modelId: 'model-1',
      provider: 'openrouter',
    }));

    await store.openThread('thread-1');
    const assistant = await store.createAssistantMessage({
      modelId: 'model-1',
      provider: 'openrouter',
    });

    expect(chatService.createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      parentMessageId: null,
      branchGroupId: expect.any(String),
      role: 'assistant',
      content: '',
      status: 'streaming',
      modelId: 'model-1',
      provider: 'openrouter',
      reasoningSummary: null,
    });
    expect(assistant).toMatchObject({ id: 'assistant-1', status: 'streaming' });

    store.patchStreamingMessage('assistant-1', {
      content: 'Hello',
      reasoningSummary: 'Reasoning',
    });

    expect(store.messages()).toMatchObject([
      {
        id: 'assistant-1',
        content: 'Hello',
        status: 'streaming',
        reasoningSummary: 'Reasoning',
      },
    ]);
  });

  it('persists completed and failed assistant message states', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({
      messages: [
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Hello',
          status: 'streaming',
          position: 0,
        }),
      ],
    }));
    chatService.updateMessage
      .mockResolvedValueOnce(makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hello there',
        status: 'complete',
        position: 0,
      }))
      .mockResolvedValueOnce(makeMessage({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Hello there',
        status: 'failed',
        error: 'Generation failed',
        position: 0,
      }));

    await store.openThread('thread-1');
    const completed = await store.updateMessage('assistant-1', {
      content: 'Hello there',
      status: 'complete',
    });

    expect(completed).toMatchObject({ status: 'complete', content: 'Hello there' });
    expect(store.messages()).toMatchObject([{ status: 'complete', content: 'Hello there' }]);

    store.patchStreamingMessage('assistant-1', {
      status: 'failed',
      error: 'Generation failed',
    });
    const failed = await store.updateMessage('assistant-1', {
      status: 'failed',
      error: 'Generation failed',
    });

    expect(failed).toMatchObject({ status: 'failed', error: 'Generation failed' });
    expect(store.messages()).toMatchObject([{ status: 'failed', error: 'Generation failed' }]);
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

  it('creates an edited message as a sibling branch without context metadata', async () => {
    const source = makeMessage({
      id: 'user-1',
      content: 'Original prompt',
    });
    const branch = makeMessage({
      id: 'user-2',
      content: 'Edited prompt',
      branchOrder: 1,
    });
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [source] }));
    chatService.createMessage.mockResolvedValueOnce(branch);

    await store.openThread('thread-1');
    const created = await store.createMessageBranch('user-1', '  Edited prompt  ');

    expect(chatService.createMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      parentMessageId: null,
      branchGroupId: 'branch-1',
      role: 'user',
      content: 'Edited prompt',
      status: 'complete',
    });
    expect(created).toMatchObject({ id: 'user-2', branchOrder: 1 });
    expect(store.getMessageBranchCount(source)).toBe(2);
  });

  it('selects a newly created message branch directly', async () => {
    const original = makeMessage({ id: 'user-1' });
    const branch = makeMessage({ id: 'user-2', branchOrder: 1 });
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [original, branch] }));
    chatService.selectBranch.mockResolvedValueOnce({
      threadId: 'thread-1',
      branchGroupId: 'branch-1',
      selectedMessageId: 'user-2',
    });

    await store.openThread('thread-1');

    await expect(store.selectMessageBranch('user-2')).resolves.toBe(true);
    expect(chatService.selectBranch).toHaveBeenCalledWith('thread-1', 'branch-1', 'user-2');
    expect(store.visibleMessages().map((message) => message.id)).toEqual(['user-2']);
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
    expect(toastService.error).toHaveBeenCalledWith('Load failed', 'Chat');
  });

  it('stores errors and resets saving flags when sending fails', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({ messages: [] }));
    chatService.createMessage.mockRejectedValueOnce(new Error('Send failed'));

    await store.openThread('thread-1');
    const sent = await store.sendMessage('Hello');

    expect(sent).toBeNull();
    expect(store.messages()).toEqual([]);
    expect(store.error()).toBe('Send failed');
    expect(store.isSaving()).toBe(false);
    expect(toastService.error).toHaveBeenCalledWith('Send failed', 'Chat');
  });

  it('defaults visible messages to the first branch path', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({
      messages: [
        makeMessage({ id: 'user-1', branchGroupId: 'user-group', position: 0 }),
        makeMessage({
          id: 'assistant-1',
          parentMessageId: 'user-1',
          branchGroupId: 'assistant-group',
          role: 'assistant',
          content: 'First answer',
          position: 1,
          branchOrder: 0,
        }),
        makeMessage({
          id: 'assistant-2',
          parentMessageId: 'user-1',
          branchGroupId: 'assistant-group',
          role: 'assistant',
          content: 'Second answer',
          position: 1,
          branchOrder: 1,
        }),
        makeMessage({
          id: 'follow-up-1',
          parentMessageId: 'assistant-1',
          branchGroupId: 'follow-up-1-group',
          content: 'Continue first',
          position: 2,
        }),
        makeMessage({
          id: 'follow-up-2',
          parentMessageId: 'assistant-2',
          branchGroupId: 'follow-up-2-group',
          content: 'Continue second',
          position: 2,
        }),
      ],
      branchSelections: [],
    }));

    await store.openThread('thread-1');

    expect(store.visibleMessages().map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
      'follow-up-1',
    ]);
  });

  it('updates the visible branch path after selecting an adjacent branch', async () => {
    chatService.getThread.mockResolvedValueOnce(makeThreadDetail({
      messages: [
        makeMessage({ id: 'user-1', branchGroupId: 'user-group', position: 0 }),
        makeMessage({
          id: 'assistant-1',
          parentMessageId: 'user-1',
          branchGroupId: 'assistant-group',
          role: 'assistant',
          content: 'First answer',
          position: 1,
          branchOrder: 0,
        }),
        makeMessage({
          id: 'assistant-2',
          parentMessageId: 'user-1',
          branchGroupId: 'assistant-group',
          role: 'assistant',
          content: 'Second answer',
          position: 1,
          branchOrder: 1,
        }),
        makeMessage({
          id: 'follow-up-1',
          parentMessageId: 'assistant-1',
          branchGroupId: 'follow-up-1-group',
          content: 'Continue first',
          position: 2,
        }),
        makeMessage({
          id: 'follow-up-2',
          parentMessageId: 'assistant-2',
          branchGroupId: 'follow-up-2-group',
          content: 'Continue second',
          position: 2,
        }),
      ],
      branchSelections: [
        {
          threadId: 'thread-1',
          branchGroupId: 'assistant-group',
          selectedMessageId: 'assistant-1',
        },
      ],
    }));
    chatService.selectBranch.mockResolvedValueOnce({
      threadId: 'thread-1',
      branchGroupId: 'assistant-group',
      selectedMessageId: 'assistant-2',
    });

    await store.openThread('thread-1');
    await store.selectAdjacentMessageBranch('assistant-1', 1);

    expect(chatService.selectBranch).toHaveBeenCalledWith(
      'thread-1',
      'assistant-group',
      'assistant-2',
    );
    expect(store.visibleMessages().map((message) => message.id)).toEqual([
      'user-1',
      'assistant-2',
      'follow-up-2',
    ]);
    expect(store.getMessageBranchCount(store.visibleMessages()[1])).toBe(2);
    expect(store.getMessageBranchIndex(store.visibleMessages()[1])).toBe(2);
  });
});
