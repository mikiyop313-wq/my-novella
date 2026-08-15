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
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { type ChatMessageDetailDto, type ChatMessageRole } from '../../../../shared/models/chat.model';
import { AiStore } from '../../core/store/ai.store';
import {
  AutocompleteDropdownComponent,
  type DropdownOption,
} from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ElementAnimationDirective } from '../../shared/directives/element-animation.directive';
import { ToastService } from '../../shared/services/toast.service';
import { ChatThreads } from './components/chat-threads/chat-threads';
import { ChatResponseService } from './services/chat-response.service';
import { ChatWindowService } from './services/chat-window.service';
import { ChatStore } from './store/chat.store';

const NEW_CHAT_ROUTE_ID = 'new-chat';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [ChatThreads, AutocompleteDropdownComponent, CdkMenuModule, ElementAnimationDirective],
  providers: [ChatResponseService],
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);


  // ---------------------------------------------------------------------------
  // View Queries
  // ---------------------------------------------------------------------------

  @ViewChild('chatAnimation') private chatAnimation?: ElementAnimationDirective;
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
  readonly copiedMessageId = signal<string | null>(null);
  readonly expandedReasoningMessageIds = signal<ReadonlySet<string>>(new Set());
  readonly isAutoScrollEnabled = signal(true);
  readonly isChatAtBottom = signal(true);

  private cleanupDetachedWindowClosedListener: (() => void) | null = null;
  private copyConfirmationTimeout: ReturnType<typeof setTimeout> | null = null;


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
    this.isAiResponseActive() && !this.isChatAtBottom()
  ));

  readonly modelOptions = computed<DropdownOption[]>(() => (
    this.aiStore.models().map((model) => ({
      value: model.id,
      label: model.name || model.id,
    }))
  ));

  readonly supportsReasoning = computed(() => {
    const modelId = this.selectedModelId();
    return !!modelId && this.aiStore.models()
      .find((model) => model.id === modelId)?.supportsReasoning === true;
  });

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
    afterRenderEffect(() => {
      this.response.renderVersion();

      if (untracked(() => this.isAiResponseActive() && this.isAutoScrollEnabled())) {
        this.scrollChatToBottom('auto');
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.aiStore.loadModels();

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
    this.cleanupDetachedWindowClosedListener?.();

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


  // ---------------------------------------------------------------------------
  // Composer Actions
  // ---------------------------------------------------------------------------

  isPromptSubmitDisabled(): boolean {
    return this.chatStore.isSaving() || this.isAiResponseActive();
  }

  isSendButtonDisabled(): boolean {
    return !this.selectedModelId() || this.isPromptSubmitDisabled();
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

  handlePromptKeydown(event: KeyboardEvent, input: HTMLTextAreaElement): void {
    if (event.key !== 'Enter') return;

    if (event.shiftKey) {
      queueMicrotask(() => this.resizePromptInput(input));
      return;
    }

    event.preventDefault();
    void this.sendPrompt(input);
  }

  async sendPrompt(input: HTMLTextAreaElement): Promise<void> {
    const content = input.value.trim();
    if (!content || this.isSendButtonDisabled()) return;

    const userMessage = await this.chatStore.sendMessage(content);
    if (!userMessage || this.chatStore.error()) return;

    input.value = '';
    this.resizePromptInput(input);

    const thread = this.chatStore.selectedThread();
    if (!this.isDetachedMode && thread && (this.isNewChatRoute() || this.selectedThreadId !== thread.id)) {
      this.selectedThreadId = thread.id;
      this.hasActiveConversation = true;
      await this.navigateToThread(thread.id, this.isNewChatRoute());
    }

    this.prepareForResponse();
    await this.response.generateResponse(userMessage, content, this.getResponseSettings());
  }

  async handleSendOrStop(input: HTMLTextAreaElement): Promise<void> {
    if (this.response.isGeneratingResponse()) {
      const error = await this.response.stopResponse();
      if (error) this.reportError(error);
      return;
    }

    await this.sendPrompt(input);
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

    this.editingMessageId = null;

    if (trimmedContent === message.content.trim()) {
      this.prepareForResponse();
      await this.response.retryResponseForUser(message, this.getResponseSettings());
      return;
    }

    const editedMessage = await this.chatStore.createMessageBranch(message.id, trimmedContent);
    if (!editedMessage) return;

    const selected = await this.chatStore.selectMessageBranch(editedMessage.id);
    if (!selected) return;

    this.prepareForResponse();
    await this.response.generateResponse(editedMessage, trimmedContent, this.getResponseSettings());
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
    this.prepareForResponse();
    await this.response.retryMessage(messageId, this.getResponseSettings());
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

    this.isChatAtBottom.set(isAtBottom);
    this.isAutoScrollEnabled.set(isAtBottom);
  }

  scrollToLatestResponse(): void {
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

    const threadElement = this.chatThreads?.getThreadElement(id);
    if (this.chatAnimation && threadElement) {
      await this.chatAnimation.animateBeforeDelete(threadElement, removeAndNavigate);
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
    this.isAutoScrollEnabled.set(true);
    this.isChatAtBottom.set(true);
  }

  private getResponseSettings() {
    return {
      selectedModelId: this.selectedModelId(),
      reasoningMode: this.reasoningMode(),
    };
  }

  private isScrollAtBottom(element: HTMLElement): boolean {
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distanceFromBottom <= 32;
  }

  private scrollChatToBottom(behavior: ScrollBehavior): void {
    const element = this.chatBody?.nativeElement;
    if (!element) return;

    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior });
      return;
    }

    element.scrollTop = element.scrollHeight;
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
