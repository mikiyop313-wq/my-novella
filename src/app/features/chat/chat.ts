import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownComponent } from 'ngx-markdown';

import { type ChatMessageDetailDto, type ChatMessageRole } from '../../../../shared/models/chat.model';
import { buildContextHighlightSegments } from '../../../../shared/utils/context-highlighter';
import { AiStore } from '../../core/store/ai.store';
import { AutocompleteDropdownComponent } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import type { AiManuscriptContextRef } from '../../shared/models/ai-context.model';
import {
  type MarkdownKeywordClick,
  type MarkdownKeywordHighlight,
} from '../../shared/components/markdown-editor/markdown-editor.extensions';
import { ToastService } from '../../shared/services/toast.service';
import { expandManuscriptRefs } from '../../shared/utils/story-context-builder';
import { CodexContextHighlightDirective } from '../codex/highlighting/codex-context-highlight.directive';
import { CodexMatchChooserService } from '../codex/highlighting/codex-match-chooser.service';
import { CodexContextTrieService } from '../codex/services/codex-context-trie.service';
import {
  getAutomaticallyIncludedCodexEntryIds,
  removeAutomaticallyIncludedCodexEntryIds,
} from '../manuscript/components/ai-prompt/ai-prompt-codex-context';
import {
  type AiContextSelection,
  buildContextDropdownSections,
  buildModelDropdownSections,
  contextSelectionToValues,
  dropdownValuesToContextSelection,
} from '../manuscript/components/ai-prompt/ai-prompt-dropdown-options';
import { WorkspaceBookStore } from '../workspace/workspace-book.store';
import { WorkspaceStore } from '../workspace/workspace.store';
import { ChatThreads } from './components/chat-threads/chat-threads';
import {
  ChatResponseService,
  type ChatResponseSettings,
} from './services/chat-response.service';
import { ChatWindowService } from './services/chat-window.service';
import { ChatStore } from './store/chat.store';

const NEW_CHAT_ROUTE_ID = 'new-chat';
const CHAT_BOTTOM_THRESHOLD_PX = 32;
const STREAMING_AUTO_SCROLL_FRAMES = 3;

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    ChatThreads,
    AutocompleteDropdownComponent,
    CdkMenuModule,
    MarkdownComponent,
    MarkdownEditorComponent,
    CodexContextHighlightDirective,
  ],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat implements OnInit, OnDestroy {

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  readonly chatStore = inject(ChatStore);
  readonly aiStore = inject(AiStore);
  readonly response = inject(ChatResponseService);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatWindowService = inject(ChatWindowService);
  private readonly toastService = inject(ToastService);
  private readonly codexContextTrie = inject(CodexContextTrieService);
  private readonly codexMatchChooser = inject(CodexMatchChooserService);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly workspaceStore = inject(WorkspaceStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);


  // ---------------------------------------------------------------------------
  // View Queries
  // ---------------------------------------------------------------------------

  @ViewChild('chatBody') private chatBody?: ElementRef<HTMLElement>;
  @ViewChild(ChatThreads) private chatThreads?: ChatThreads;
  @ViewChild('activeRenameInput') private activeRenameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('messageEditInput') private messageEditInput?: ElementRef<HTMLTextAreaElement>;


  // ---------------------------------------------------------------------------
  // UI State
  // ---------------------------------------------------------------------------

  hasActiveConversation = false;
  isDetachedMode = false;
  selectedThreadId: string | null = null;
  editingActiveThreadId: string | null = null;
  editingMessageId: string | null = null;

  readonly isChatOpenInDetachedWindow = signal(false);
  readonly selectedModelId = signal<string | null>(null);
  readonly reasoningMode = signal(false);
  readonly composerValue = signal('');
  readonly copiedMessageId = signal<string | null>(null);
  readonly expandedReasoningMessageIds = signal<ReadonlySet<string>>(new Set());
  readonly isAutoScrollEnabled = signal(true);
  readonly isChatAtBottom = signal(true);
  readonly includeFullOutline = signal(false);
  readonly contextManuscriptRefs = signal<AiManuscriptContextRef[]>([]);
  readonly contextCodexEntryIds = signal<string[]>([]);
  readonly automaticallyIncludedCodexEntryIds = signal<ReadonlySet<string>>(new Set());

  readonly contextHierarchy = this.workspaceBookStore.bookHierarchy;
  readonly contextHierarchyLoading = this.workspaceBookStore.isLoadingBookHierarchy;
  readonly contextHierarchyError = this.workspaceBookStore.bookHierarchyError;
  readonly contextCodexEntries = this.codexContextTrie.entries;
  readonly contextCodexTrie = this.codexContextTrie.trie;
  readonly contextCodexLoading = this.codexContextTrie.isLoading;
  readonly contextCodexError = this.codexContextTrie.error;

  private cleanupDetachedWindowClosedListener: (() => void) | null = null;
  private copyConfirmationTimeout: ReturnType<typeof setTimeout> | null = null;
  private scrollAnimationFrame: number | null = null;
  private streamingScrollAnimationFrame: number | null = null;
  private pendingStreamingScrollFrames = 0;
  private hasUserScrollIntent = false;
  private lastChatScrollTop = 0;
  private contextAvailabilityRefreshQueued = false;
  private contextTrackingDestroyed = false;


  // ---------------------------------------------------------------------------
  // Computed State
  // ---------------------------------------------------------------------------

  readonly isAiResponseActive = computed(() => (
    this.response.isGeneratingResponse() ||
    this.chatStore.messages().some((message) => this.isMessageStreaming(message))
  ));

  // Template aliases keep the response state readable without exposing a
  // second source of truth in the component.
  readonly isGeneratingResponse = this.response.isGeneratingResponse;
  readonly isStoppingResponse = this.response.isStoppingResponse;

  readonly showScrollToBottom = computed(() => (
    this.hasActiveConversation && !this.isAutoScrollEnabled() && !this.isChatAtBottom()
  ));

  readonly modelDropdownSections = computed(() => (
    buildModelDropdownSections({
      providers: this.aiStore.modelProviders(),
      loading: this.aiStore.isLoading(),
      error: this.aiStore.error(),
    })
  ));

  readonly supportsReasoning = computed(() => {
    const modelId = this.selectedModelId();
    return !!modelId && this.aiStore.models()
      .find((model) => model.id === modelId)?.supportsReasoning === true;
  });

  readonly composerKeywordHighlights = computed<MarkdownKeywordHighlight[]>(() => {
    const content = this.composerValue();
    if (!content) return [];

    // Keep this computed reactive to Codex index refreshes as well as composer edits.
    this.codexContextTrie.trie();
    const matches = this.codexContextTrie.findMatches(content);

    return buildContextHighlightSegments(content, matches)
      .filter(segment => segment.isMatch)
      .map(segment => ({
        startIndex: segment.startIndex,
        endIndex: segment.endIndex,
        entryIds: [...new Set(segment.matches.map(match => match.value.entryId))],
      }));
  });

  readonly contextDropdownSections = computed(() => buildContextDropdownSections({
    hierarchy: this.contextHierarchy(),
    codexEntries: this.contextCodexEntries(),
    automaticallyIncludedCodexEntryIds: this.automaticallyIncludedCodexEntryIds(),
    hierarchyLoading: this.contextHierarchyLoading(),
    codexLoading: this.contextCodexLoading(),
    hierarchyError: this.contextHierarchyError(),
    codexError: this.contextCodexError(),
  }));

  readonly selectedContextValues = computed(() => contextSelectionToValues({
    includeFullOutline: this.includeFullOutline(),
    manuscriptRefs: this.contextManuscriptRefs(),
    codexEntryIds: this.contextCodexEntryIds(),
  }, this.contextHierarchy()));

  get showDetachedSidebar(): boolean {
    return this.isDetachedMode;
  }

  get showMainDetachedState(): boolean {
    return this.isChatOpenInDetachedWindow() && !this.isDetachedMode;
  }

  get isNewChat(): boolean {
    if (!this.hasActiveConversation) return false;

    const thread = this.chatStore.selectedThread();
    return !thread || thread.messages.length === 0;
  }


  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  constructor() {
    effect(() => {
      if (this.aiStore.isLoading() || !this.aiStore.hasLoaded()) return;

      const selectedModelId = this.selectedModelId();
      if (
        selectedModelId
        && !this.aiStore.models().some((model) => model.id === selectedModelId)
      ) {
        this.selectedModelId.set(null);
      }
    });

    effect(() => {
      this.composerValue();
      this.contextCodexEntries();
      this.contextCodexTrie();
      this.scheduleContextAvailabilityRefresh();
    });

    afterRenderEffect(() => {
      this.response.renderVersion();

      if (untracked(() => this.isAiResponseActive() && this.isAutoScrollEnabled())) {
        this.followStreamingResponseToBottom();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    void this.aiStore.refreshModels();

    const sessionId = this.route.snapshot.paramMap.get('sessionId');
    if (sessionId) {
      this.isDetachedMode = true;
      await this.initializeDetachedChat(sessionId);
      return;
    }

    const bookId = this.route.parent?.snapshot.paramMap.get('bookId');
    if (!bookId) {
      this.reportError('Open a book before starting a chat.');
      return;
    }

    const initialThreadId = this.route.snapshot.paramMap.get('threadId');
    const isNewChatRoute = this.isNewChatRoute();
    this.initializeConversationState(initialThreadId, isNewChatRoute);

    void this.loadContextHierarchy(bookId);
    await this.enterWorkspaceChat(bookId, initialThreadId, isNewChatRoute);
    this.route.paramMap?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.syncThreadFromRoute(params.get('threadId'));
    });

    this.isChatOpenInDetachedWindow.set(this.chatWindowService.isBookDetached(bookId));
    this.cleanupDetachedWindowClosedListener = this.chatWindowService.onDetachedWindowClosed((event) => {
      if (event.bookId === this.chatStore.bookId()) {
        this.isChatOpenInDetachedWindow.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.contextTrackingDestroyed = true;
    this.cleanupDetachedWindowClosedListener?.();
    this.cancelFluidScroll();
    this.cancelStreamingAutoScroll();

    if (this.copyConfirmationTimeout) {
      clearTimeout(this.copyConfirmationTimeout);
    }
  }


  // ---------------------------------------------------------------------------
  // Thread Navigation
  // ---------------------------------------------------------------------------

  async startNewConversation(): Promise<void> {
    if (this.isNewChat) return;

    const replaceUrl = this.hasActiveConversation;
    this.chatStore.closeThread();
    this.hasActiveConversation = true;
    this.selectedThreadId = null;

    if (!this.isDetachedMode) {
      await this.navigateToNewChat(replaceUrl);
    }
  }

  async selectThread(id: string): Promise<void> {
    if (!this.isDetachedMode) {
      await this.navigateToThread(id);
      return;
    }

    await this.openThread(id);
  }

  async goBackToList(): Promise<void> {
    if (this.isDetachedMode) return;

    this.hasActiveConversation = false;
    this.selectedThreadId = null;
    this.chatStore.closeThread();
    await this.navigateToThreads(true);
  }


  // ---------------------------------------------------------------------------
  // Thread Management
  // ---------------------------------------------------------------------------

  async archiveThread(id: string): Promise<void> {
    await this.removeThreadWithAnimation(id, () => this.chatStore.archiveThread(id));
  }

  async deleteThread(id: string): Promise<void> {
    await this.removeThreadWithAnimation(id, () => this.chatStore.deleteThread(id));
  }

  async renameThread(event: { id: string; title: string }): Promise<void> {
    await this.chatStore.updateThread(event.id, { title: event.title });
  }

  startRenameActiveThread(id: string): void {
    this.editingActiveThreadId = id;
    afterNextRender(() => {
      const input = this.activeRenameInput?.nativeElement;
      input?.focus();
      input?.select();
    }, { injector: this.injector });
  }

  async saveActiveThreadRename(id: string, newTitle: string, currentTitle: string): Promise<void> {
    if (this.editingActiveThreadId !== id) return;

    this.editingActiveThreadId = null;
    const trimmedTitle = newTitle.trim();
    if (trimmedTitle && trimmedTitle !== currentTitle) {
      await this.chatStore.updateThread(id, { title: trimmedTitle });
    }
  }

  cancelActiveThreadRename(): void {
    this.editingActiveThreadId = null;
  }


  // ---------------------------------------------------------------------------
  // Message Presentation
  // ---------------------------------------------------------------------------

  getMessageAuthor(role: ChatMessageRole): string {
    if (role === 'assistant') return 'AI';
    if (role === 'system') return 'System';
    return 'You';
  }

  isMessageStreaming(message: ChatMessageDetailDto): boolean {
    return message.role === 'assistant' && message.status === 'streaming';
  }

  hasMessageContent(message: ChatMessageDetailDto): boolean {
    return message.content.trim().length > 0;
  }

  getMessageMarkdownData(message: ChatMessageDetailDto): string {
    if (message.role !== 'assistant') return message.content;

    return this.renderAssistantParagraphs(message.content);
  }

  hasMessageReasoning(message: ChatMessageDetailDto): boolean {
    return message.role === 'assistant' && (message.reasoningSummary?.trim().length ?? 0) > 0;
  }

  isMessageReasoningExpanded(messageId: string): boolean {
    return this.expandedReasoningMessageIds().has(messageId);
  }

  toggleMessageReasoning(messageId: string): void {
    this.expandedReasoningMessageIds.update((expandedMessageIds) => {
      const nextExpandedMessageIds = new Set(expandedMessageIds);

      if (nextExpandedMessageIds.has(messageId)) {
        nextExpandedMessageIds.delete(messageId);
      } else {
        nextExpandedMessageIds.add(messageId);
      }

      return nextExpandedMessageIds;
    });
  }

  getMessageBranchCount(message: ChatMessageDetailDto): number {
    return this.chatStore.getMessageBranchCount(message);
  }

  getMessageBranchIndex(message: ChatMessageDetailDto): number {
    return this.chatStore.getMessageBranchIndex(message);
  }

  formatMessageTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Now';

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  private renderAssistantParagraphs(content: string): string {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    const renderedLines: string[] = [];
    let isInsideFence = false;

    for (const line of lines) {
      const currentLineIsFence = this.isMarkdownFenceLine(line);
      const previousLine = renderedLines.at(-1);

      if (
        previousLine !== undefined
        && !isInsideFence
        && !currentLineIsFence
        && this.shouldSeparateAssistantParagraphs(previousLine, line)
      ) {
        renderedLines.push('');
      }

      renderedLines.push(line);

      if (currentLineIsFence) {
        isInsideFence = !isInsideFence;
      }
    }

    return renderedLines.join('\n');
  }

  private shouldSeparateAssistantParagraphs(previousLine: string, nextLine: string): boolean {
    return previousLine.trim().length > 0
      && nextLine.trim().length > 0
      && !this.isMarkdownBlockLine(previousLine)
      && !this.isMarkdownBlockLine(nextLine);
  }

  private isMarkdownFenceLine(line: string): boolean {
    return /^\s*(```|~~~)/.test(line);
  }

  private isMarkdownBlockLine(line: string): boolean {
    const trimmedLine = line.trim();

    if (!trimmedLine) return true;
    if (this.isMarkdownFenceLine(line)) return true;

    return /^(#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/.test(trimmedLine)
      || /^([-*_]\s*){3,}$/.test(trimmedLine)
      || /^\|?[\s:-]+\|[\s|:-]*$/.test(trimmedLine)
      || /\S\s*\|\s*\S/.test(trimmedLine)
      || /^\s{4,}\S/.test(line);
  }


  // ---------------------------------------------------------------------------
  // Composer Actions
  // ---------------------------------------------------------------------------

  isPromptSubmitDisabled(): boolean {
    return this.chatStore.isSaving() || this.isAiResponseActive();
  }

  isSendButtonDisabled(): boolean {
    const selectedModelId = this.selectedModelId();
    return !selectedModelId
      || !this.aiStore.models().some((model) => model.id === selectedModelId)
      || this.isPromptSubmitDisabled();
  }

  isSendOrStopDisabled(): boolean {
    return this.response.isGeneratingResponse()
      ? this.response.isStoppingResponse()
      : this.isSendButtonDisabled();
  }

  toggleReasoningMode(): void {
    if (this.supportsReasoning()) {
      this.reasoningMode.update((enabled) => !enabled);
    }
  }

  openComposerKeyword(event: MarkdownKeywordClick): void {
    this.codexMatchChooser.open(event.entryIds, event.clientX, event.clientY);
  }

  refreshContextAvailability(): void {
    const detectedEntryIds = new Set<string>();
    for (const line of this.composerValue().split(/\r?\n/)) {
      for (const match of this.codexContextTrie.findMatches(line)) {
        if (match.value.entryId) detectedEntryIds.add(match.value.entryId);
      }
    }

    const automaticallyIncludedEntryIds = getAutomaticallyIncludedCodexEntryIds(
      this.contextCodexEntries(),
      detectedEntryIds,
    );
    if (!this.setsEqual(
      this.automaticallyIncludedCodexEntryIds(),
      automaticallyIncludedEntryIds,
    )) {
      this.automaticallyIncludedCodexEntryIds.set(automaticallyIncludedEntryIds);
    }

    const selectedEntryIds = this.contextCodexEntryIds();
    const reconciledEntryIds = removeAutomaticallyIncludedCodexEntryIds(
      selectedEntryIds,
      automaticallyIncludedEntryIds,
    );
    if (reconciledEntryIds.length !== selectedEntryIds.length) {
      this.contextCodexEntryIds.set(reconciledEntryIds);
    }
  }

  onContextChange(values: readonly string[]): void {
    const selection: AiContextSelection = dropdownValuesToContextSelection(
      values,
      this.contextHierarchy(),
    );
    const manuscriptRefs = [...new Set(selection.manuscriptRefs)];
    const codexEntryIds = removeAutomaticallyIncludedCodexEntryIds(
      [...new Set(selection.codexEntryIds)],
      this.automaticallyIncludedCodexEntryIds(),
    );

    this.includeFullOutline.set(selection.includeFullOutline);
    this.contextManuscriptRefs.set(manuscriptRefs);
    this.contextCodexEntryIds.set(codexEntryIds);
  }

  async sendPrompt(): Promise<void> {
    const content = this.composerValue().trim();
    if (!content || this.isSendButtonDisabled()) return;

    const responseSettings = this.getResponseSettings();
    if (!responseSettings) return;

    const userMessage = await this.chatStore.sendMessage(content);
    if (!userMessage || this.chatStore.error()) return;

    this.composerValue.set('');

    const thread = this.chatStore.selectedThread();
    if (!this.isDetachedMode && thread && (this.isNewChatRoute() || this.selectedThreadId !== thread.id)) {
      this.selectedThreadId = thread.id;
      this.hasActiveConversation = true;
      await this.navigateToThread(thread.id, this.isNewChatRoute());
    }

    this.prepareForResponse();
    await this.response.generateResponse(userMessage, content, responseSettings);
  }

  async handleSendOrStop(): Promise<void> {
    if (this.response.isGeneratingResponse()) {
      const error = await this.response.stopResponse();
      if (error) this.reportError(error);
      return;
    }

    await this.sendPrompt();
  }

  resizePromptInput(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }


  // ---------------------------------------------------------------------------
  // Message Editing and Branching
  // ---------------------------------------------------------------------------

  editMessage(messageId: string): void {
    if (this.chatStore.isSaving() || this.isAiResponseActive()) return;

    const message = this.chatStore.visibleMessages().find((item) => item.id === messageId);
    if (!message || message.role !== 'user') return;

    this.editingMessageId = message.id;
    afterNextRender(() => {
      const input = this.messageEditInput?.nativeElement;
      input?.focus();
      input?.select();
      if (input) this.resizePromptInput(input);
    }, { injector: this.injector });
  }

  cancelMessageEdit(): void {
    this.editingMessageId = null;
  }

  async saveMessageEdit(messageId: string, content: string): Promise<void> {
    if (this.editingMessageId !== messageId || this.chatStore.isSaving() || this.isAiResponseActive()) return;

    const message = this.chatStore.visibleMessages().find((item) => item.id === messageId);
    const trimmedContent = content.trim();
    if (!message || message.role !== 'user' || !trimmedContent) return;

    const responseSettings = this.getResponseSettings();
    if (!responseSettings) return;

    this.editingMessageId = null;

    if (trimmedContent === message.content.trim()) {
      this.prepareForResponse();
      await this.response.retryResponseForUser(message, responseSettings);
      return;
    }

    const editedMessage = await this.chatStore.createMessageBranch(message.id, trimmedContent);
    if (!editedMessage) return;

    const selected = await this.chatStore.selectMessageBranch(editedMessage.id);
    if (!selected) return;

    this.prepareForResponse();
    await this.response.generateResponse(editedMessage, trimmedContent, responseSettings);
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (this.chatStore.isSaving() || this.isAiResponseActive()) return;

    const thread = this.chatStore.selectedThread();
    if (!thread?.messages.some((message) => message.id === messageId)) return;

    await this.chatStore.deleteMessage(messageId);
  }

  async copyMessage(messageId: string, content: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      this.copiedMessageId.set(messageId);

      if (this.copyConfirmationTimeout) {
        clearTimeout(this.copyConfirmationTimeout);
      }

      this.copyConfirmationTimeout = setTimeout(() => {
        this.copiedMessageId.set(null);
        this.copyConfirmationTimeout = null;
      }, 2000);
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Failed to copy message.');
    }
  }

  async retryMessage(messageId: string): Promise<void> {
    const responseSettings = this.getResponseSettings();
    if (!responseSettings) return;

    this.prepareForResponse();
    await this.response.retryMessage(messageId, responseSettings);
  }

  async previousMessageBranch(messageId: string): Promise<void> {
    await this.chatStore.selectAdjacentMessageBranch(messageId, -1);
  }

  async nextMessageBranch(messageId: string): Promise<void> {
    await this.chatStore.selectAdjacentMessageBranch(messageId, 1);
  }


  // ---------------------------------------------------------------------------
  // Detached Window
  // ---------------------------------------------------------------------------

  async detachChat(): Promise<void> {
    if (this.isDetachedMode) return;

    this.isChatOpenInDetachedWindow.set(await this.openOrFocusDetachedChat());
  }

  async focusDetachedChat(): Promise<void> {
    await this.openOrFocusDetachedChat();
  }


  // ---------------------------------------------------------------------------
  // Scrolling
  // ---------------------------------------------------------------------------

  handleChatBodyScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const isAtBottom = this.isScrollAtBottom(element);
    const isScrollingUp = element.scrollTop < this.lastChatScrollTop - 1;

    if (
      this.isAiResponseActive()
      && this.isAutoScrollEnabled()
      && !isAtBottom
      && !this.hasUserScrollIntent
      && !isScrollingUp
    ) {
      this.isChatAtBottom.set(true);
      this.followStreamingResponseToBottom();
      this.lastChatScrollTop = element.scrollTop;
      return;
    }

    this.hasUserScrollIntent = false;
    this.isChatAtBottom.set(isAtBottom);
    this.isAutoScrollEnabled.set(isAtBottom);
    this.lastChatScrollTop = element.scrollTop;
  }

  handleChatBodyUserScrollIntent(): void {
    this.hasUserScrollIntent = true;
  }

  scrollToLatestResponse(): void {
    this.hasUserScrollIntent = false;
    this.isAutoScrollEnabled.set(true);
    this.isChatAtBottom.set(true);
    this.scrollChatToBottom('smooth');
  }


  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private initializeConversationState(threadId: string | null, isNewChatRoute: boolean): void {
    if (this.isNewChatThreadId(threadId) || isNewChatRoute) {
      this.selectedThreadId = null;
      this.hasActiveConversation = true;
      return;
    }

    if (threadId) {
      this.selectedThreadId = threadId;
      this.hasActiveConversation = true;
    }
  }



  private async removeThreadWithAnimation(id: string, removeThread: () => Promise<void>): Promise<void> {
    const wasSelectedThread = this.selectedThreadId === id;
    const removeAndNavigate = async () => {
      await removeThread();

      if (wasSelectedThread) {
        this.selectedThreadId = null;
        this.hasActiveConversation = false;

        if (!this.isDetachedMode) {
          await this.navigateToThreads();
        }
      }
    };

    if (this.chatThreads) {
      await this.chatThreads.animateThreadRemoval(id, removeAndNavigate);
      return;
    }

    await removeAndNavigate();
  }

  private async syncThreadFromRoute(threadId: string | null): Promise<void> {
    if (this.isDetachedMode) return;

    if (this.isNewChatThreadId(threadId)) {
      const hadSavedThreadOpen = this.selectedThreadId !== null;
      this.hasActiveConversation = true;
      this.selectedThreadId = null;
      if (hadSavedThreadOpen || !this.chatStore.selectedThread()) {
        this.chatStore.closeThread();
      }
      return;
    }

    if (!threadId) {
      if (this.isNewChatRoute()) {
        this.hasActiveConversation = true;
        this.selectedThreadId = null;
        this.chatStore.closeThread();
        return;
      }

      this.hasActiveConversation = false;
      this.selectedThreadId = null;
      this.chatStore.closeThread();
      return;
    }

    if (this.chatStore.selectedThread()?.id === threadId) {
      this.selectedThreadId = threadId;
      this.hasActiveConversation = true;
      return;
    }

    await this.openThread(threadId);

    if (!this.chatStore.selectedThread()) {
      await this.navigateToThreads(true);
    }
  }

  private async openThread(id: string): Promise<void> {
    this.selectedThreadId = id;
    this.hasActiveConversation = true;
    await this.chatStore.openThread(id);

    if (!this.chatStore.selectedThread()) {
      this.selectedThreadId = null;
      this.hasActiveConversation = false;
      return;
    }

    this.selectedModelId.set(this.response.getLastUsedModelId(this.chatStore.visibleMessages()));
    this.reasoningMode.set(false);
  }

  private async openOrFocusDetachedChat(): Promise<boolean> {
    const bookId = this.chatStore.bookId();
    if (!bookId) {
      this.reportError('Open a book before detaching chat.');
      return false;
    }

    try {
      await this.chatWindowService.openDetachedWindow({
        bookId,
        selectedThreadId: this.selectedThreadId,
      });
      return true;
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Failed to detach chat.');
      return false;
    }
  }

  private async initializeDetachedChat(sessionId: string): Promise<void> {
    try {
      const session = await this.chatWindowService.getDetachedSession(sessionId);
      if (!session) {
        throw new Error('Detached chat session could not be found.');
      }

      void this.codexContextTrie.loadForContext(session.bookId);
      void this.workspaceStore.enterBook(session.bookId);
      void this.loadContextHierarchy(session.bookId);
      await this.chatStore.enterBook(session.bookId);
      if (session.selectedThreadId) {
        await this.selectThread(session.selectedThreadId);
      }

      if (!this.hasActiveConversation) {
        await this.startNewConversation();
      }
    } catch (error) {
      this.reportError(error instanceof Error ? error.message : 'Failed to open detached chat.');
    }
  }

  private prepareForResponse(): void {
    this.hasUserScrollIntent = false;
    this.lastChatScrollTop = this.chatBody?.nativeElement.scrollTop ?? 0;
    this.isAutoScrollEnabled.set(true);
    this.isChatAtBottom.set(true);
  }

  private getResponseSettings(): ChatResponseSettings | null {
    this.refreshContextAvailability();
    if (
      this.contextCodexLoading()
      || this.contextCodexError()
      || this.contextCodexTrie() === null
    ) {
      this.toastService.error('Codex context is not available yet.', 'AI Context');
      return null;
    }
    if (this.contextHierarchyLoading() || this.contextHierarchyError()) {
      this.toastService.error('Manuscript context is not available yet.', 'AI Context');
      return null;
    }

    return {
      selectedModelId: this.selectedModelId(),
      reasoningMode: this.reasoningMode(),
      context: {
        includeFullOutline: this.includeFullOutline(),
        sceneIds: [...expandManuscriptRefs(
          this.contextHierarchy(),
          this.contextManuscriptRefs(),
        )],
        codexEntryIds: [...new Set([
          ...this.contextCodexEntryIds(),
          ...this.automaticallyIncludedCodexEntryIds(),
        ])],
      },
    };
  }

  private async loadContextHierarchy(bookId: string): Promise<void> {
    try {
      await this.workspaceBookStore.loadBookHierarchy('book', bookId);
    } catch {
      // The store exposes the error to the context dropdown and send guard.
    }
  }

  private scheduleContextAvailabilityRefresh(): void {
    if (this.contextAvailabilityRefreshQueued || this.contextTrackingDestroyed) return;

    this.contextAvailabilityRefreshQueued = true;
    queueMicrotask(() => {
      this.contextAvailabilityRefreshQueued = false;
      if (!this.contextTrackingDestroyed) this.refreshContextAvailability();
    });
  }

  private setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    return left.size === right.size && [...left].every((value) => right.has(value));
  }

  private isScrollAtBottom(element: HTMLElement): boolean {
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom <= CHAT_BOTTOM_THRESHOLD_PX;
  }

  private followStreamingResponseToBottom(): void {
    this.scrollChatToBottom('auto');
    this.isChatAtBottom.set(true);
    this.pendingStreamingScrollFrames = STREAMING_AUTO_SCROLL_FRAMES;

    if (this.streamingScrollAnimationFrame !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }

    this.streamingScrollAnimationFrame = requestAnimationFrame(() => this.continueStreamingAutoScroll());
  }

  private continueStreamingAutoScroll(): void {
    this.streamingScrollAnimationFrame = null;

    if (!this.isAiResponseActive() || !this.isAutoScrollEnabled()) {
      this.pendingStreamingScrollFrames = 0;
      return;
    }

    this.scrollChatToBottom('auto');
    this.isChatAtBottom.set(true);
    this.pendingStreamingScrollFrames -= 1;

    if (this.pendingStreamingScrollFrames <= 0 || typeof requestAnimationFrame !== 'function') return;

    this.streamingScrollAnimationFrame = requestAnimationFrame(() => this.continueStreamingAutoScroll());
  }

  private scrollChatToBottom(behavior: ScrollBehavior): void {
    const element = this.chatBody?.nativeElement;
    if (!element) return;

    if (behavior === 'smooth') {
      this.fluidScrollToBottom(element);
      return;
    }

    this.cancelFluidScroll();

    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior });
      this.lastChatScrollTop = element.scrollTop;
      return;
    }

    element.scrollTop = element.scrollHeight;
    this.lastChatScrollTop = element.scrollTop;
  }

  private fluidScrollToBottom(element: HTMLElement): void {
    this.cancelFluidScroll();

    const startTop = element.scrollTop;
    const targetTop = element.scrollHeight;
    const distance = targetTop - startTop;

    if (
      Math.abs(distance) <= 1
      || this.prefersReducedMotion()
      || typeof requestAnimationFrame !== 'function'
    ) {
      element.scrollTop = targetTop;
      return;
    }

    const duration = Math.min(720, Math.max(260, Math.abs(distance) * 0.35));
    const startTime = performance.now();

    const step = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      element.scrollTop = startTop + distance * easedProgress;

      if (progress < 1) {
        this.scrollAnimationFrame = requestAnimationFrame(step);
        return;
      }

      element.scrollTop = targetTop;
      this.isAutoScrollEnabled.set(true);
      this.isChatAtBottom.set(true);
      this.scrollAnimationFrame = null;
    };

    this.scrollAnimationFrame = requestAnimationFrame(step);
  }

  private cancelFluidScroll(): void {
    if (this.scrollAnimationFrame === null) return;

    cancelAnimationFrame(this.scrollAnimationFrame);
    this.scrollAnimationFrame = null;
  }

  private cancelStreamingAutoScroll(): void {
    if (this.streamingScrollAnimationFrame === null) return;

    cancelAnimationFrame(this.streamingScrollAnimationFrame);
    this.streamingScrollAnimationFrame = null;
    this.pendingStreamingScrollFrames = 0;
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private getWorkspaceBookId(): string | null {
    return this.route.parent?.snapshot.paramMap.get('bookId') ?? this.chatStore.bookId();
  }

  private async enterWorkspaceChat(bookId: string, threadId: string | null, isNewChatRoute: boolean): Promise<void> {
    const isSameBook = this.chatStore.bookId() === bookId;
    const selectedThread = this.chatStore.selectedThread();

    if (isNewChatRoute) {
      this.chatStore.closeThread();
      await this.loadWorkspaceThreads(bookId, isSameBook);
      return;
    }

    if (isSameBook && (!threadId || selectedThread?.id === threadId)) {
      await this.chatStore.loadThreads(bookId);
      return;
    }

    await this.chatStore.enterBook(bookId);
  }

  private async loadWorkspaceThreads(bookId: string, isSameBook: boolean): Promise<void> {
    if (isSameBook) {
      await this.chatStore.loadThreads(bookId);
      return;
    }

    await this.chatStore.enterBook(bookId);
  }

  private async navigateToThreads(replaceUrl = false): Promise<void> {
    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    await this.router.navigate(['/workspace', bookId, 'threads'], { replaceUrl });
  }

  private async navigateToNewChat(replaceUrl = false): Promise<void> {
    const bookId = this.getWorkspaceBookId();
    if (!bookId) {
      this.reportError('Open a book before starting a chat.');
      return;
    }

    await this.router.navigate(['/workspace', bookId, 'thread', NEW_CHAT_ROUTE_ID], { replaceUrl });
  }

  private async navigateToThread(threadId: string, replaceUrl = false): Promise<void> {
    const bookId = this.getWorkspaceBookId();
    if (!bookId) return;

    await this.router.navigate(['/workspace', bookId, 'thread', threadId], { replaceUrl });
  }

  private isNewChatRoute(): boolean {
    return (
      this.route.snapshot.routeConfig?.path === 'new-chat' ||
      this.isNewChatThreadId(this.route.snapshot.paramMap.get('threadId'))
    );
  }

  private isNewChatThreadId(threadId: string | null): boolean {
    return threadId === NEW_CHAT_ROUTE_ID;
  }

  private reportError(message: string): void {
    this.toastService.error(message, 'Chat');
  }
}
