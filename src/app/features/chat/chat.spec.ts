import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { provideMarkdown } from 'ngx-markdown';

import {
  type ChatMessageDetailDto,
  type ChatThreadDetailDto,
  type ChatThreadDto,
} from '../../../../shared/models/chat.model';
import { AiStreamService } from '../../core/services/ai-stream.service';
import { AiStore } from '../../core/store/ai.store';
import { AutocompleteDropdownComponent } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import { ToastService } from '../../shared/services/toast.service';
import { CodexContextHighlightRegistryService } from '../codex/highlighting/codex-context-highlight-registry.service';
import { CodexMatchChooserService } from '../codex/highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import { CodexEntryOpenerService } from '../codex/services/codex-entry-opener.service';
import { CodexWindowService } from '../codex/services/codex-window.service';
import { WorkspaceBookStore } from '../workspace/workspace-book.store';
import { WorkspaceStore } from '../workspace/workspace.store';
import { Chat } from './chat';
import { ChatAiContextService } from './services/chat-ai-context.service';
import { ChatWindowService } from './services/chat-window.service';
import { ChatStore } from './store/chat.store';

function makeThreadDetail(overrides: Partial<ChatThreadDetailDto> = {}): ChatThreadDetailDto {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Draft chat',
    status: 'active',
    lastModelId: null,
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
    updateThread: ReturnType<typeof vi.fn>;
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
    modelProviders: ReturnType<typeof vi.fn>;
    isLoading: ReturnType<typeof vi.fn>;
    hasLoaded: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    refreshModels: ReturnType<typeof vi.fn>;
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
  let codexWindowService: {
    onDetachedEntryChanged: ReturnType<typeof vi.fn>;
  };
  let toastService: Pick<ToastService, 'error'>;
  let matchChooser: { open: ReturnType<typeof vi.fn> };
  let detachedWindowClosedCallback: ((event: { bookId: string; sessionId: string }) => void) | null;
  let codexEntryChangedCallback: ((event: { bookId: string | null }) => void) | null;
  let detachedBookIds: Set<string>;
  const trieState = signal<object | null>({});
  const contextEntries = signal<any[]>([]);
  const contextLoading = signal(false);
  const contextError = signal<string | null>(null);
  const contextTrie = {
    trie: trieState.asReadonly(),
    entries: contextEntries.asReadonly(),
    isLoading: contextLoading.asReadonly(),
    error: contextError.asReadonly(),
    findMatches: vi.fn((text: string) => findCodexMatches(text)),
    loadForContext: vi.fn(),
    refreshCurrentContext: vi.fn(),
  };
  const contextHierarchy = signal<any[]>([]);
  const contextHierarchyLoading = signal(false);
  const contextHierarchyError = signal<string | null>(null);
  const workspaceBookStore = {
    bookHierarchy: contextHierarchy.asReadonly(),
    isLoadingBookHierarchy: contextHierarchyLoading.asReadonly(),
    bookHierarchyError: contextHierarchyError.asReadonly(),
    loadBookHierarchy: vi.fn(async () => contextHierarchy()),
  };
  const workspaceStore = {
    bookId: signal<string | null>('book-1').asReadonly(),
    bookTitle: signal('Draft Book').asReadonly(),
    enterBook: vi.fn(async () => undefined),
  };
  const chatAiContext = {
    buildContext: vi.fn(async () => null),
  };
  const highlightRegistry = {
    setRanges: vi.fn(),
    clearRanges: vi.fn(),
    getEntryIdsAtPoint: vi.fn(() => []),
  };

  async function createComponent(routeValue: unknown): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [
        { provide: ActivatedRoute, useValue: routeValue },
        { provide: Router, useValue: router },
        { provide: ChatStore, useValue: chatStore },
        { provide: ChatWindowService, useValue: chatWindowService },
        { provide: CodexWindowService, useValue: codexWindowService },
        { provide: AiStore, useValue: aiStore },
        { provide: AiStreamService, useValue: aiStreamService },
        { provide: ToastService, useValue: toastService },
        { provide: CodexContextTrieService, useValue: contextTrie },
        { provide: CodexContextHighlightRegistryService, useValue: highlightRegistry },
        { provide: CodexMatchChooserService, useValue: matchChooser },
        { provide: CodexEntryOpenerService, useValue: { open: vi.fn() } },
        { provide: WorkspaceBookStore, useValue: workspaceBookStore },
        { provide: WorkspaceStore, useValue: workspaceStore },
        { provide: ChatAiContextService, useValue: chatAiContext },
        ...provideMarkdown(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Chat);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function composerEditor(): MarkdownEditorComponent {
    const debugElement = fixture.debugElement.query(By.directive(MarkdownEditorComponent));
    if (!debugElement) throw new Error('Expected chat Markdown composer');
    return debugElement.componentInstance as MarkdownEditorComponent;
  }

  function setComposerValue(value: string): MarkdownEditorComponent {
    const editor = composerEditor();
    const view = editor.editorView();
    if (!view) throw new Error('Expected chat Markdown editor view');

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    fixture.detectChanges();
    return editor;
  }

  async function remountComponent(): Promise<void> {
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
    codexEntryChangedCallback = null;
    detachedBookIds = new Set();
    trieState.set({});
    contextEntries.set([]);
    contextLoading.set(false);
    contextError.set(null);
    contextHierarchy.set([]);
    contextHierarchyLoading.set(false);
    contextHierarchyError.set(null);
    contextTrie.findMatches.mockReset().mockImplementation((text: string) => findCodexMatches(text));
    contextTrie.loadForContext.mockClear();
    contextTrie.refreshCurrentContext.mockClear();
    workspaceBookStore.loadBookHierarchy.mockClear();
    workspaceStore.enterBook.mockClear();
    chatAiContext.buildContext.mockClear();
    highlightRegistry.setRanges.mockClear();
    highlightRegistry.clearRanges.mockClear();
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
      openThread: vi.fn(async (id: string) => {
        await Promise.resolve();
        selectedThread = makeThreadDetail({
          id,
          title: id === 'thread-2' ? 'Second thread' : 'Draft chat',
          messages: [],
        });
      }),
      closeThread: vi.fn(() => {
        selectedThread = null;
      }),
      createThread: vi.fn(async () => {
        const thread = makeThread();
        selectedThread = { ...thread, messages: [], branchSelections: [] };
        return thread;
      }),
      updateThread: vi.fn(async (id: string, data: Partial<ChatThreadDto>) => {
        if (selectedThread?.id === id) {
          selectedThread = { ...selectedThread, ...data };
        }
      }),
      sendMessage: vi.fn(async (content: string) => {
        const message = makeMessage({ content });
        selectedThread = makeThreadDetail({ messages: [message] });
        return message;
      }),
      createMessageBranch: vi.fn(),
      createAssistantMessage: vi.fn(async (data: {
        threadId?: string;
        parentMessageId?: string | null;
        provider?: string | null;
        modelId?: string | null;
      } = {}) => {
        const threadId = data.threadId ?? selectedThread?.id ?? 'thread-1';
        const message = makeMessage({
          id: 'assistant-1',
          threadId,
          parentMessageId: data.parentMessageId ?? null,
          branchGroupId: 'branch-2',
          role: 'assistant',
          content: '',
          status: 'streaming',
          position: selectedThread?.messages.length ?? 1,
          provider: data.provider ?? null,
          modelId: data.modelId ?? null,
        });
        if (selectedThread?.id === message.threadId) {
          selectedThread = {
            ...selectedThread,
            messages: [...selectedThread.messages, message],
          };
        }
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
      modelProviders: vi.fn(() => [{
        id: 'openrouter',
        name: 'OpenRouter',
        state: 'ready',
        models: [{
          id: 'openrouter/test-model',
          name: 'Test Model',
          provider: 'test',
          source: 'openrouter',
          supportsReasoning: true,
        }],
      }]),
      isLoading: vi.fn(() => false),
      hasLoaded: vi.fn(() => true),
      error: vi.fn(() => null),
      refreshModels: vi.fn(() => Promise.resolve()),
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
    codexWindowService = {
      onDetachedEntryChanged: vi.fn((callback: (event: { bookId: string | null }) => void) => {
        codexEntryChangedCallback = callback;
        return () => {
          codexEntryChangedCallback = null;
        };
      }),
    };
    toastService = { error: vi.fn() };
    matchChooser = { open: vi.fn() };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows detached-window failures through the shared chat toast', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({}) },
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    chatWindowService.openDetachedWindow.mockRejectedValueOnce(new Error('Window blocked'));

    await component.detachChat();

    expect(toastService.error).toHaveBeenCalledWith('Window blocked', 'Chat');
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
        lastModelId: 'openrouter/test-model',
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

  it('uses the provider-grouped model menu and updates nested model selection', async () => {
    const models = [
      {
        id: 'openai/gpt-5',
        name: 'GPT-5',
        provider: 'openai',
        providerName: 'OpenAI',
        source: 'direct',
      },
      {
        id: 'anthropic/claude',
        name: 'Claude',
        provider: 'openrouter',
        providerName: 'OpenRouter: Anthropic',
        source: 'openrouter',
      },
    ];
    aiStore.models.mockReturnValue(models);
    aiStore.modelProviders.mockReturnValue([
      { id: 'openrouter', name: 'OpenRouter', state: 'ready', models: [models[1]] },
      { id: 'openai', name: 'OpenAI', state: 'ready', models: [models[0]] },
    ]);

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

    const dropdownDebug = fixture.debugElement.query(
      By.css('.chat-input-footer app-autocomplete-dropdown'),
    );
    const dropdown = dropdownDebug.componentInstance as AutocompleteDropdownComponent;
    const providers = dropdown.sections()[0].options;

    expect(providers.map((provider) => provider.label)).toEqual(['OpenRouter', 'OpenAI']);
    expect(providers[0].submenu?.sections[0].title).toBe('Anthropic');
    expect(providers[0].submenu?.sections[0].options[0].value).toBe('anthropic/claude');
    expect(providers[1].submenu?.sections[0].options[0].value).toBe('openai/gpt-5');

    dropdown.selectionChange.emit('anthropic/claude');

    expect(component.selectedModelId()).toBe('anthropic/claude');
  });

  it('clears a stale saved model and blocks sending until another model is selected', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'new-chat' }) },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) },
      },
    });

    component.selectedModelId.set('ollama/removed-model');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedModelId()).toBeNull();
    expect(component.isSendButtonDisabled()).toBe(true);
  });

  it('restores the model saved on an opened thread', async () => {
    currentBookId = 'book-1';
    selectedThread = makeThreadDetail({ lastModelId: 'openrouter/test-model' });

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) },
      },
    });

    expect(component.selectedModelId()).toBe('openrouter/test-model');
  });

  it('persists model picker changes on the selected thread', async () => {
    currentBookId = 'book-1';
    selectedThread = makeThreadDetail();

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) },
      },
    });

    await component.onModelSelectionChange('openrouter/test-model');

    expect(component.selectedModelId()).toBe('openrouter/test-model');
    expect(chatStore.updateThread).toHaveBeenCalledWith('thread-1', {
      lastModelId: 'openrouter/test-model',
    });
  });

  it('persists an unsaved chat model after the first message creates its thread', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: {
        snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) },
      },
    });

    await component.onModelSelectionChange('openrouter/test-model');
    expect(chatStore.updateThread).not.toHaveBeenCalled();
    expect(component.hasSelectedModel()).toBe(true);

    setComposerValue('Start the thread');
    await component.sendPrompt();

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Start the thread');
    expect(chatStore.updateThread).toHaveBeenCalledWith('thread-1', {
      lastModelId: 'openrouter/test-model',
    });
  });

  it('blocks message editing and retrying when no model is selected', async () => {
    currentBookId = 'book-1';
    const user = makeMessage({ id: 'user-1' });
    const assistant = makeMessage({
      id: 'assistant-1',
      parentMessageId: 'user-1',
      role: 'assistant',
      position: 1,
    });
    selectedThread = makeThreadDetail({ messages: [user, assistant] });

    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: {
        snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) },
      },
    });

    component.editMessage('user-1');
    await component.retryMessage('assistant-1');
    fixture.detectChanges();

    expect(component.editingMessageId).toBeNull();
    expect(chatStore.createAssistantMessage).not.toHaveBeenCalled();
    const editButton = fixture.nativeElement.querySelector(
      '.message-actions .action-btn[title="Edit"]',
    ) as HTMLButtonElement;
    const retryButton = fixture.nativeElement.querySelector(
      '.message-actions .action-btn[title="Retry"]',
    ) as HTMLButtonElement;
    expect(editButton.disabled).toBe(true);
    expect(retryButton.disabled).toBe(true);
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

    component.selectedModelId.set('openrouter/test-model');
    await component.startNewConversation();

    expect(chatStore.closeThread).toHaveBeenCalled();
    expect(chatStore.createThread).not.toHaveBeenCalled();
    expect(component.hasActiveConversation).toBe(true);
    expect(component.selectedThreadId).toBeNull();
    expect(component.selectedModelId()).toBeNull();
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
    setComposerValue('Start here');

    await component.sendPrompt();

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Start here');
    expect(router.navigate).toHaveBeenCalledWith(['/workspace', 'book-1', 'thread', 'thread-1'], { replaceUrl: true });
  });

  it('keeps explicit context after sending and snapshots composer-only Codex detection', async () => {
    contextHierarchy.set([{
      id: 'act-1',
      bookId: 'book-1',
      title: 'Act One',
      position: 0,
      status: 'active',
      summary: null,
      chapters: [{
        id: 'chapter-1',
        actId: 'act-1',
        title: 'Chapter One',
        position: 0,
        status: 'active',
        summary: null,
        scenes: [{
          id: 'scene-1',
          chapterId: 'chapter-1',
          title: 'Opening',
          position: 0,
          status: 'active',
          prose: null,
          summary: null,
          wordCount: 1,
          pointOfViewOverride: null,
          povCharacterIdOverride: null,
        }],
      }],
    }]);
    contextEntries.set([
      {
        id: 'codex-1',
        bookId: 'book-1',
        type: 'character',
        name: 'Mara Vale',
        alias: null,
        description: null,
        image: null,
        status: 'active',
        trackingSetting: 'include_when_detected',
        createdAt: '',
        lastEditedAt: '',
      },
      {
        id: 'codex-manual',
        bookId: 'book-1',
        type: 'lore',
        name: 'Moon Rite',
        alias: null,
        description: null,
        image: null,
        status: 'active',
        trackingSetting: 'manual',
        createdAt: '',
        lastEditedAt: '',
      },
      {
        id: 'codex-always',
        bookId: 'book-1',
        type: 'location',
        name: 'Observatory',
        alias: null,
        description: null,
        image: null,
        status: 'active',
        trackingSetting: 'always_include',
        createdAt: '',
        lastEditedAt: '',
      },
    ]);
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
    component.onContextChange(['outline', 'scene:scene-1', 'codex:codex-manual']);
    setComposerValue('Ask Mara Vale about the opening.');

    await component.sendPrompt();

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Ask Mara Vale about the opening.');
    expect(chatAiContext.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      includeFullOutline: true,
      sceneIds: ['scene-1'],
      codexEntryIds: ['codex-manual', 'codex-1', 'codex-always'],
    }));
    expect(component.includeFullOutline()).toBe(true);
    expect(component.contextManuscriptRefs()).toEqual(['novel']);
    expect(component.contextCodexEntryIds()).toEqual(['codex-manual']);
  });

  it('uses replacement selection state and does not detect Codex from message history', async () => {
    contextEntries.set([{
      id: 'codex-1',
      bookId: 'book-1',
      type: 'character',
      name: 'Mara Vale',
      alias: null,
      description: null,
      image: null,
      status: 'active',
      trackingSetting: 'include_when_detected',
      createdAt: '',
      lastEditedAt: '',
    }]);
    selectedThread = makeThreadDetail({
      messages: [makeMessage({ content: 'Mara Vale appeared earlier.' })],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
    component.onContextChange(['outline', 'codex:codex-1']);
    component.onContextChange([]);
    setComposerValue('Continue without that context.');

    await component.sendPrompt();

    expect(chatStore.sendMessage).toHaveBeenCalledWith('Continue without that context.');
    expect(chatAiContext.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      includeFullOutline: false,
      sceneIds: [],
      codexEntryIds: [],
    }));
    expect(component.automaticallyIncludedCodexEntryIds()).toEqual(new Set());
  });

  it('removes deleted Codex selections before submitting composer context', async () => {
    contextEntries.set([{
      id: 'codex-manual',
      bookId: 'book-1',
      type: 'lore',
      name: 'Moon Rite',
      alias: null,
      description: null,
      image: null,
      status: 'active',
      trackingSetting: 'manual',
      createdAt: '',
      lastEditedAt: '',
    }]);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'new-chat' }) },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
    component.onContextChange(['codex:codex-manual']);
    setComposerValue('Continue the scene.');

    contextEntries.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.contextCodexEntryIds()).toEqual([]);

    await component.sendPrompt();

    expect(chatAiContext.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      codexEntryIds: [],
    }));
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
    setComposerValue('Start here');

    await component.sendPrompt();

    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      parentMessageId: 'message-1',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      threadId: 'thread-1',
    }));
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      streamId: 'pending-message-1',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Start here',
        messages: [{ role: 'user', content: 'Start here' }],
      },
    }));
    expect(chatStore.patchStreamingMessage).toHaveBeenCalledWith('assistant-1', {
      content: 'AI reply',
    });
    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'AI reply',
      status: 'complete',
    }));
  });

  it('does not save or show an assistant message when generation returns no content', async () => {
    aiStreamService.streamText.mockResolvedValueOnce('');
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
    setComposerValue('Start here');

    await component.sendPrompt();
    fixture.detectChanges();

    expect(chatStore.createAssistantMessage).not.toHaveBeenCalled();
    expect(chatStore.updateMessage).not.toHaveBeenCalled();
    expect(chatStore.deleteMessage).not.toHaveBeenCalled();
    expect(selectedThread?.messages).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.message-row.from-assistant')).toBeNull();
    expect(fixture.nativeElement.querySelector('.message-spinner')).toBeNull();
  });

  it('renders user and assistant markdown messages while sanitizing unsafe HTML', async () => {
    selectedThread = makeThreadDetail({
      messages: [
        makeMessage({
          id: 'user-1',
          role: 'user',
          content: 'Use **user bold** and *user italic*.',
        }),
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          branchGroupId: 'branch-2',
          content: 'Use **assistant bold**, *assistant italic*, and <script>alert(1)</script>.',
          position: 1,
        }),
      ],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const userMessage = fixture.nativeElement.querySelector('.message-row.from-user') as HTMLElement;
    const assistantMessage = fixture.nativeElement.querySelector('.message-row.from-assistant') as HTMLElement;

    expect(userMessage.querySelector('strong')?.textContent).toBe('user bold');
    expect(userMessage.querySelector('em')?.textContent).toBe('user italic');
    expect(assistantMessage.querySelector('strong')?.textContent).toBe('assistant bold');
    expect(assistantMessage.querySelector('em')?.textContent).toBe('assistant italic');
    expect(assistantMessage.querySelector('script')).toBeNull();
  });

  it('highlights Codex keywords live in the workspace chat composer', async () => {
    await createComponent(workspaceThreadRoute());

    const editor = setComposerValue('Mara Vale `Silver Key` [key](<Silver Key>)');
    expect([...editor.editorView()!.contentDOM.querySelectorAll('.cm-codex-keyword')]
      .map(element => element.textContent)).toEqual(['Mara Vale']);

    setComposerValue('Mara');
    expect(editor.editorView()!.contentDOM.querySelector('.cm-codex-keyword')).toBeNull();

    setComposerValue('Silver Key');
    expect(editor.editorView()!.contentDOM.querySelector('.cm-codex-keyword')?.textContent)
      .toBe('Silver Key');

    setComposerValue('');
    expect(editor.editorView()!.contentDOM.querySelector('.cm-codex-keyword')).toBeNull();
  });

  it('preserves overlapping Codex entry IDs and opens the composer keyword chooser', async () => {
    contextTrie.findMatches.mockImplementation((text: string) => {
      const match = findCodexMatches(text)[0];
      return match
        ? [match, { ...match, value: { ...match.value, entryId: 'codex-3' } }]
        : [];
    });
    await createComponent(workspaceThreadRoute());
    const editor = setComposerValue('Mara Vale');

    expect(component.composerKeywordHighlights()).toEqual([{
      startIndex: 0,
      endIndex: 9,
      entryIds: ['codex-1', 'codex-3'],
    }]);

    editor.keywordClick.emit({
      entryIds: ['codex-1', 'codex-3'],
      clientX: 12,
      clientY: 24,
    });

    expect(matchChooser.open).toHaveBeenCalledWith(['codex-1', 'codex-3'], 12, 24);
  });

  it('highlights only workspace user and assistant Markdown without changing rendered DOM', async () => {
    selectedThread = makeThreadDetail({
      title: 'Title Codex',
      messages: [
        makeMessage({
          id: 'user-1',
          role: 'user',
          content: 'Mara **Vale**',
        }),
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          branchGroupId: 'branch-2',
          content: 'Silver Key <script>alert(1)</script>',
          reasoningSummary: 'Hidden Reasoning',
          position: 1,
        }),
        makeMessage({
          id: 'system-1',
          role: 'system',
          branchGroupId: 'branch-3',
          content: 'System Codex',
          position: 2,
        }),
      ],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent(workspaceThreadRoute());
    await waitForHighlightScan();

    const messageList = fixture.nativeElement.querySelector('.message-list') as HTMLElement;
    const htmlBeforeRefresh = messageList.innerHTML;
    const ranges = highlightRegistry.setRanges.mock.calls.at(-1)?.[1] ?? [];
    expect(ranges.map((item: { range: Range }) => item.range.toString())).toEqual([
      'Mara Vale',
      'Silver Key',
    ]);
    expect(contextTrie.findMatches).not.toHaveBeenCalledWith('Hidden Reasoning');
    expect(contextTrie.findMatches).not.toHaveBeenCalledWith('System Codex');
    expect(contextTrie.findMatches).not.toHaveBeenCalledWith('Title Codex');
    expect(fixture.nativeElement.querySelector('.message-row.from-assistant script')).toBeNull();
    expect(fixture.nativeElement.querySelector('.chat-input')).not.toBeNull();

    trieState.set({ refreshed: true });
    fixture.detectChanges();
    await waitForHighlightScan();

    expect(messageList.innerHTML).toBe(htmlBeforeRefresh);
    expect(contextTrie.loadForContext).not.toHaveBeenCalled();
  });

  it('coalesces streaming Markdown DOM updates into one highlight rescan', async () => {
    selectedThread = makeThreadDetail({
      messages: [
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Mara',
          status: 'streaming',
        }),
      ],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent(workspaceThreadRoute());
    await waitForHighlightScan();
    highlightRegistry.setRanges.mockClear();

    const renderedParagraph = fixture.nativeElement.querySelector(
      '.message-row.from-assistant markdown.message-text p',
    ) as HTMLParagraphElement;
    renderedParagraph.textContent = 'Mara V';
    renderedParagraph.textContent = 'Mara Vale';
    await waitForHighlightScan();

    expect(highlightRegistry.setRanges).toHaveBeenCalledTimes(1);
    expect(highlightRegistry.setRanges.mock.calls[0][1]
      .map((item: { range: Range }) => item.range.toString())).toEqual(['Mara Vale']);
  });

  it('highlights sent messages and composer keywords in detached chat', async () => {
    chatWindowService.getDetachedSession.mockResolvedValueOnce({
      sessionId: 'session-1',
      bookId: 'book-1',
      selectedThreadId: null,
    });
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ sessionId: 'session-1' }) },
      parent: null,
    });
    selectedThread = makeThreadDetail({
      messages: [makeMessage({ content: 'Mara Vale' })],
    });
    component.hasActiveConversation = true;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    await waitForHighlightScan();
    const editor = setComposerValue('Mara Vale');

    expect(component.isDetachedMode).toBe(true);
    expect(fixture.nativeElement.querySelector('.message-row.from-user')).not.toBeNull();
    expect(component.composerKeywordHighlights()).toEqual([{
      startIndex: 0,
      endIndex: 9,
      entryIds: ['codex-1'],
    }]);
    expect(editor.editorView()!.contentDOM.querySelector('.cm-codex-keyword')?.textContent)
      .toBe('Mara Vale');
    expect(highlightRegistry.setRanges.mock.calls.at(-1)?.[1]
      .map((item: { range: Range }) => item.range.toString())).toEqual(['Mara Vale']);
    expect(contextTrie.loadForContext).toHaveBeenCalledWith('book-1');
  });

  it('renders assistant single newlines as paragraph breaks without changing user newlines', async () => {
    selectedThread = makeThreadDetail({
      messages: [
        makeMessage({
          id: 'user-1',
          role: 'user',
          content: 'First paragraph\nSecond paragraph',
        }),
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          branchGroupId: 'branch-2',
          content: 'First paragraph\nSecond paragraph',
          position: 1,
        }),
      ],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const userMessage = fixture.nativeElement.querySelector('.message-row.from-user') as HTMLElement;
    const assistantMessage = fixture.nativeElement.querySelector('.message-row.from-assistant') as HTMLElement;
    const userParagraphs = userMessage.querySelectorAll('.message-text p');
    const assistantParagraphs = assistantMessage.querySelectorAll('.message-text p');

    expect(userParagraphs).toHaveLength(1);
    expect(assistantParagraphs).toHaveLength(2);
    expect(assistantParagraphs[0]?.textContent).toBe('First paragraph');
    expect(assistantParagraphs[1]?.textContent).toBe('Second paragraph');
  });

  function workspaceThreadRoute() {
    return {
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    };
  }

  async function waitForHighlightScan(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  it('preserves assistant markdown block structure while preparing paragraph breaks', async () => {
    selectedThread = makeThreadDetail({
      messages: [
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: [
            '- First item',
            '- Second item',
            '```ts',
            'const one = 1;',
            'const two = 2;',
            '```',
          ].join('\n'),
        }),
      ],
    });
    chatStore.openThread.mockResolvedValueOnce(undefined);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const assistantMessage = fixture.nativeElement.querySelector('.message-row.from-assistant') as HTMLElement;
    const listItems = assistantMessage.querySelectorAll('.message-text li');
    const codeBlock = assistantMessage.querySelector('.message-text pre code') as HTMLElement | null;

    expect(listItems).toHaveLength(2);
    expect(listItems[0]?.textContent).toBe('First item');
    expect(listItems[1]?.textContent).toBe('Second item');
    expect(codeBlock?.textContent).toContain('const one = 1;\nconst two = 2;');
  });

  it('renders Markdown formatting in the composer while preserving its source', async () => {
    await createComponent({
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'new-chat' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'new-chat' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });

    const editor = setComposerValue('Use **bold** and *italic*');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(editor.editorView()?.state.doc.toString()).toBe('Use **bold** and *italic*');
    expect(fixture.nativeElement.querySelector('.chat-input .cm-md-strong')?.textContent).toBe('bold');
    expect(fixture.nativeElement.querySelector('.chat-input .cm-md-emphasis')?.textContent).toBe('italic');
    expect(fixture.nativeElement.querySelector('.chat-input-preview')).toBeNull();
  });

  it('serializes formatted composer content to markdown and clears after sending', async () => {
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

    const editor = setComposerValue('Send **this**');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.chat-input-preview')).toBeNull();

    await component.sendPrompt();
    fixture.detectChanges();

    expect(editor.editorView()?.state.doc.toString()).toBe('');
    expect(fixture.nativeElement.querySelector('.chat-input-preview')).toBeNull();
    expect(chatStore.sendMessage).toHaveBeenCalledWith('Send **this**');
  });

  it('keeps the Markdown draft when the user message is not saved', async () => {
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
    chatStore.sendMessage.mockResolvedValueOnce(null);
    const editor = setComposerValue('Keep **this** draft');

    await component.sendPrompt();
    fixture.detectChanges();

    expect(editor.editorView()?.state.doc.toString()).toBe('Keep **this** draft');
    expect(aiStreamService.streamText).not.toHaveBeenCalled();
  });

  it('creates and selects an edited user-message branch before generating a response', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    await fixture.whenStable();
    component.selectedModelId.set('openrouter/test-model');
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
      aiPrompt: expect.objectContaining({ prompt: 'Edited prompt' }),
    }));
  });

  it('treats an unchanged user-message edit as an assistant retry', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
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
    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      parentMessageId: 'user-1',
      provider: 'openrouter',
      modelId: 'openrouter/test-model',
      branchGroupId: 'assistant-group',
      threadId: 'thread-1',
    }));
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Keep this prompt',
        messages: [{ role: 'user', content: 'Keep this prompt' }],
      },
    }));
  });

  it('retries an assistant response as a selected sibling branch', async () => {
    contextEntries.set([{
      id: 'codex-current',
      bookId: 'book-1',
      type: 'lore',
      name: 'Current lore',
      alias: null,
      description: null,
      image: null,
      status: 'active',
      trackingSetting: 'manual',
      createdAt: '',
      lastEditedAt: '',
    }]);
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
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
    component.onContextChange(['codex:codex-current']);

    await component.retryMessage('assistant-1');

    expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      parentMessageId: 'user-1',
      branchGroupId: 'assistant-group',
    }));
    expect(aiStreamService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      aiPrompt: {
        systemPromptCategory: 'chat',
        prompt: 'Prompt',
        messages: [{ role: 'user', content: 'Prompt' }],
      },
    }));
    expect(chatAiContext.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      includeFullOutline: false,
      sceneIds: [],
      codexEntryIds: ['codex-current'],
    }));
  });

  it('creates only one retry branch when streaming finishes before branch creation resolves', async () => {
    await createComponent({
      snapshot: { paramMap: convertToParamMap({ threadId: 'thread-1' }) },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    });
    component.selectedModelId.set('openrouter/test-model');
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
    setComposerValue('Start here');

    const sendPromise = component.sendPrompt();
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
    setComposerValue('Start here');

    const sendPromise = component.sendPrompt();
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());
    fixture.detectChanges();

    const sendButton = fixture.nativeElement.querySelector('.send-btn') as HTMLButtonElement;
    expect(sendButton.getAttribute('aria-label')).toBe('Stop generating');
    expect(sendButton.querySelector('rect')).not.toBeNull();

    await component.handleSendOrStop();
    expect(aiStreamService.stopStream).toHaveBeenCalledWith('pending-message-1');

    resolveStream('');
    await sendPromise;
  });

  it('preserves the active stop control after leaving and returning during generation', async () => {
    let resolveStream!: (value: string) => void;
    aiStreamService.streamText.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveStream = resolve;
    }));
    const routeValue = {
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'thread-1' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    };

    await createComponent(routeValue);
    component.selectedModelId.set('openrouter/test-model');
    setComposerValue('Start here');

    const sendPromise = component.sendPrompt();
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());

    fixture.destroy();
    await remountComponent();

    const sendButton = fixture.nativeElement.querySelector('.send-btn') as HTMLButtonElement;
    const composer = composerEditor();
    expect(sendButton.getAttribute('aria-label')).toBe('Stop generating');
    expect(sendButton.disabled).toBe(false);
    expect(composer.readOnly()).toBe(true);
    expect(composer.editorView()?.contentDOM.getAttribute('aria-readonly')).toBe('true');
    expect(composer.editorView()?.contentDOM.getAttribute('contenteditable')).toBe('false');

    await component.handleSendOrStop();

    expect(aiStreamService.stopStream).toHaveBeenCalledWith('pending-message-1');

    resolveStream('AI reply');
    await sendPromise;

    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'AI reply',
      status: 'complete',
    }));
  });

  it('keeps generation attached to the original thread when another thread is opened before the first token', async () => {
    let streamRequest!: { onToken?: (token: string) => void };
    let resolveStream!: (value: string) => void;
    aiStreamService.streamText.mockImplementationOnce((request: { onToken?: (token: string) => void }) => {
      streamRequest = request;
      return new Promise<string>((resolve) => {
        resolveStream = resolve;
      });
    });
    const routeValue = {
      snapshot: {
        paramMap: convertToParamMap({ threadId: 'thread-1' }),
        routeConfig: { path: 'thread/:threadId' },
      },
      routeConfig: { path: 'thread/:threadId' },
      paramMap: of(convertToParamMap({ threadId: 'thread-1' })),
      parent: { snapshot: { paramMap: convertToParamMap({ bookId: 'book-1' }) } },
    };

    await createComponent(routeValue);
    component.selectedModelId.set('openrouter/test-model');
    setComposerValue('Start here');

    const sendPromise = component.sendPrompt();
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());

    expect(chatStore.createAssistantMessage).not.toHaveBeenCalled();

    selectedThread = makeThreadDetail({ id: 'thread-2', title: 'Second thread', messages: [] });
    component.selectedThreadId = 'thread-2';
    fixture.destroy();

    streamRequest.onToken?.('Thread A partial');
    await vi.waitFor(() => expect(chatStore.createAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      parentMessageId: 'message-1',
    })));
    expect(selectedThread?.messages.some((message) => message.id === 'assistant-1')).toBe(false);

    resolveStream('Thread A final');
    await sendPromise;

    expect(chatStore.updateMessage).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      content: 'Thread A partial',
      status: 'complete',
    }));
  });

  it('pauses and resumes streaming auto-scroll based on the chat scroll position', async () => {
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

    const chatBody = fixture.nativeElement.querySelector('.chat-body') as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(chatBody, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 600 },
      scrollTo: { configurable: true, value: scrollTo },
    });

    component.selectedModelId.set('openrouter/test-model');
    setComposerValue('Start here');
    const sendPromise = component.sendPrompt();
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());
    fixture.detectChanges();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_000, behavior: 'auto' });

    chatBody.dispatchEvent(new Event('wheel'));
    chatBody.scrollTop = 200;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(false);
    let scrollButton = fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement;
    expect(scrollButton).not.toBeNull();
    expect(scrollButton.classList.contains('is-visible')).toBe(true);
    expect(scrollButton.disabled).toBe(false);
    expect(scrollButton.getAttribute('aria-hidden')).toBe('false');

    chatBody.scrollTop = 600;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(true);
    scrollButton = fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement;
    expect(scrollButton.classList.contains('is-visible')).toBe(false);
    expect(scrollButton.disabled).toBe(true);
    expect(scrollButton.getAttribute('aria-hidden')).toBe('true');

    chatBody.dispatchEvent(new Event('wheel'));
    chatBody.scrollTop = 200;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    scrollButton = fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement;
    scrollButton.click();
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(true);
    expect(scrollButton.classList.contains('is-visible')).toBe(false);
    expect(scrollButton.disabled).toBe(true);
    expect(scrollButton.getAttribute('aria-hidden')).toBe('true');

    resolveStream('');
    await sendPromise;
    fixture.detectChanges();
    scrollButton = fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement;
    expect(scrollButton.classList.contains('is-visible')).toBe(false);
    expect(scrollButton.disabled).toBe(true);
    expect(scrollButton.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps streaming auto-scroll enabled when rendered content grows before scrolling catches up', async () => {
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

    const chatBody = fixture.nativeElement.querySelector('.chat-body') as HTMLElement;
    let scrollHeight = 1_000;
    const scrollTo = vi.fn((options?: ScrollToOptions) => {
      if (typeof options?.top === 'number') {
        chatBody.scrollTop = Math.max(0, options.top - chatBody.clientHeight);
      }
    });
    Object.defineProperties(chatBody, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 600 },
      scrollTo: { configurable: true, value: scrollTo },
    });

    component.selectedModelId.set('openrouter/test-model');
    setComposerValue('Start here');
    const sendPromise = component.sendPrompt();
    await vi.waitFor(() => expect(aiStreamService.streamText).toHaveBeenCalled());
    fixture.detectChanges();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_000, behavior: 'auto' });

    scrollHeight = 1_400;
    chatBody.scrollTop = 600;
    chatBody.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.isAutoScrollEnabled()).toBe(true);
    expect(component.isChatAtBottom()).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_400, behavior: 'auto' });
    const scrollButton = fixture.nativeElement.querySelector('.scroll-to-bottom-btn') as HTMLButtonElement;
    expect(scrollButton.classList.contains('is-visible')).toBe(false);

    resolveStream('');
    await sendPromise;
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
    expect(contextTrie.loadForContext).toHaveBeenCalledWith('book-1');
    expect(chatStore.openThread).toHaveBeenCalledWith('thread-1');
    expect(fixture.nativeElement.querySelector('.detach-btn')).toBeNull();
  });

  it('refreshes detached chat context when Codex changes in another window', async () => {
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

    codexEntryChangedCallback?.({ bookId: 'other-book' });
    codexEntryChangedCallback?.({ bookId: 'book-1' });

    expect(contextTrie.refreshCurrentContext).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(codexEntryChangedCallback).toBeNull();
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

function findCodexMatches(text: string) {
  const terms = [
    { term: 'mara vale', entryId: 'codex-1', pattern: /Mara\s+Vale/gi },
    { term: 'silver key', entryId: 'codex-2', pattern: /Silver\s+Key/gi },
  ];

  return terms.flatMap(({ term, entryId, pattern }) =>
    [...text.matchAll(pattern)].map((match) => ({
      term,
      value: {
        entryId,
        trackingSetting: 'include_when_detected' as const,
        status: 'active' as const,
      },
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      text: match[0],
    })),
  );
}
