import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkMenuModule } from '@angular/cdk/menu';
import { Subscription } from 'rxjs';

import { type ChatMessageRole } from '../../../../shared/models/chat.model';
import { AutocompleteDropdownComponent, type DropdownOption } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';
import { ElementAnimationDirective } from '../../shared/directives/element-animation.directive';
import { ChatThreads } from './components/chat-threads/chat-threads';
import { ChatWindowService } from './services/chat-window.service';
import { ChatStore } from './store/chat.store';
import { AiStore } from '../../core/store/ai.store';

const NEW_CHAT_ROUTE_ID = 'new-chat';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [ChatThreads, AutocompleteDropdownComponent, CdkMenuModule, ElementAnimationDirective],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class Chat implements OnInit, OnDestroy {
  readonly chatStore = inject(ChatStore);
  readonly aiStore = inject(AiStore);

  @ViewChild('chatAnimation') private chatAnimation?: ElementAnimationDirective;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatWindowService = inject(ChatWindowService);

  hasActiveConversation = false;
  isDetachedMode = false;
  readonly isChatOpenInDetachedWindow = signal(false);
  selectedThreadId: string | null = null;
  editingActiveThreadId: string | null = null;
  error: string | null = null;
  private cleanupDetachedWindowClosedListener: (() => void) | null = null;
  private routeParamSubscription: Subscription | null = null;

  selectedModelId = signal<string | null>(null);
  reasoningMode = signal<boolean>(false);

  modelOptions = computed<DropdownOption[]>(() => {
    return this.aiStore.models().map((m: any) => ({ value: m.id, label: m.name || m.id }));
  });

  supportsReasoning = computed(() => {
    const modelId = this.selectedModelId();
    if (!modelId) return false;
    const model = this.aiStore.models().find((m: any) => m.id === modelId);
    return model?.supportsReasoning === true;
  });

  get showDetachedSidebar(): boolean {
    return this.isDetachedMode;
  }

  get showMainDetachedState(): boolean {
    return this.isChatOpenInDetachedWindow() && !this.isDetachedMode;
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
      this.error = 'Open a book before starting a chat.';
      return;
    }

    const initialThreadId = this.route.snapshot.paramMap.get('threadId');
    const isNewChatRoute = this.isNewChatRoute();
    if (this.isNewChatThreadId(initialThreadId)) {
      this.selectedThreadId = null;
      this.hasActiveConversation = true;
    } else if (initialThreadId) {
      this.selectedThreadId = initialThreadId;
      this.hasActiveConversation = true;
    } else if (isNewChatRoute) {
      this.selectedThreadId = null;
      this.hasActiveConversation = true;
    }

    await this.enterWorkspaceChat(bookId, initialThreadId, isNewChatRoute);
    this.routeParamSubscription = this.route.paramMap?.subscribe(params => {
      void this.syncThreadFromRoute(params.get('threadId'));
    }) ?? null;
    this.isChatOpenInDetachedWindow.set(this.chatWindowService.isBookDetached(bookId));
    this.cleanupDetachedWindowClosedListener = this.chatWindowService.onDetachedWindowClosed(event => {
      if (event.bookId === this.chatStore.bookId()) {
        this.isChatOpenInDetachedWindow.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeParamSubscription?.unsubscribe();
    this.cleanupDetachedWindowClosedListener?.();
  }

  get isNewChat(): boolean {
    if (!this.hasActiveConversation) return false;
    const thread = this.chatStore.selectedThread();
    return !thread || thread.messages.length === 0;
  }

  async startNewConversation(): Promise<void> {
    if (this.isNewChat) return;

    if (!this.isDetachedMode) {
      const replaceUrl = this.hasActiveConversation;
      this.chatStore.closeThread();
      this.hasActiveConversation = true;
      this.selectedThreadId = null;
      await this.navigateToNewChat(replaceUrl);
      return;
    }

    this.chatStore.closeThread();
    this.hasActiveConversation = true;
    this.selectedThreadId = null;
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

  private findThreadElement(id: string): HTMLElement | undefined {
    return Array.from(document.querySelectorAll<HTMLElement>('.thread-wrapper')).find(
      (el) => el.dataset['threadId'] === id
    );
  }

  async archiveThread(id: string): Promise<void> {
    const wasSelectedThread = this.selectedThreadId === id;

    const executeArchive = async () => {
      await this.chatStore.archiveThread(id);
      if (wasSelectedThread) {
        this.selectedThreadId = null;
        this.hasActiveConversation = false;
        if (!this.isDetachedMode) {
          await this.navigateToThreads();
        }
      }
    };

    const element = this.findThreadElement(id);

    if (this.chatAnimation && element) {
      await this.chatAnimation.animateBeforeDelete(element, async () => {
        await executeArchive();
      });
    } else {
      await executeArchive();
    }
  }

  async deleteThread(id: string): Promise<void> {
    const wasSelectedThread = this.selectedThreadId === id;

    const executeDeletion = async () => {
      await this.chatStore.deleteThread(id);
      if (wasSelectedThread) {
        this.selectedThreadId = null;
        this.hasActiveConversation = false;
        if (!this.isDetachedMode) {
          await this.navigateToThreads();
        }
      }
    };

    const element = this.findThreadElement(id);

    if (this.chatAnimation && element) {
      await this.chatAnimation.animateBeforeDelete(element, async () => {
        await executeDeletion();
      });
    } else {
      await executeDeletion();
    }
  }

  async renameThread(event: { id: string, title: string }): Promise<void> {
    await this.chatStore.updateThread(event.id, { title: event.title });
  }

  startRenameActiveThread(id: string): void {
    this.editingActiveThreadId = id;
    setTimeout(() => {
      const input = document.querySelector('.active-thread-title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  async saveActiveThreadRename(id: string, newTitle: string, currentTitle: string): Promise<void> {
    if (this.editingActiveThreadId !== id) return;
    
    this.editingActiveThreadId = null;
    const trimmed = newTitle.trim();
    if (trimmed !== '' && trimmed !== currentTitle) {
      await this.chatStore.updateThread(id, { title: trimmed });
    }
  }

  cancelActiveThreadRename(): void {
    this.editingActiveThreadId = null;
  }

  getMessageAuthor(role: ChatMessageRole): string {
    if (role === 'assistant') return 'AI';
    if (role === 'system') return 'System';
    return 'You';
  }

  formatMessageTime(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Now';
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  async detachChat(): Promise<void> {
    if (this.isDetachedMode) return;

    this.isChatOpenInDetachedWindow.set(await this.openOrFocusDetachedChat());
  }

  async focusDetachedChat(): Promise<void> {
    await this.openOrFocusDetachedChat();
  }

  private async openOrFocusDetachedChat(): Promise<boolean> {
    const bookId = this.chatStore.bookId();
    if (!bookId) {
      this.error = 'Open a book before detaching chat.';
      return false;
    }

    try {
      await this.chatWindowService.openDetachedWindow({
        bookId,
        selectedThreadId: this.selectedThreadId,
      });
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to detach chat.';
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
      this.error = error instanceof Error ? error.message : 'Failed to open detached chat.';
    }
  }

  toggleReasoningMode(): void {
    if (this.supportsReasoning()) {
      this.reasoningMode.update((v) => !v);
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
    if (!content || this.chatStore.isSaving()) return;

    await this.chatStore.sendMessage(content);

    if (!this.chatStore.error()) {
      input.value = '';
      this.resizePromptInput(input);

      const thread = this.chatStore.selectedThread();
      if (!this.isDetachedMode && thread && (this.isNewChatRoute() || this.selectedThreadId !== thread.id)) {
        this.selectedThreadId = thread.id;
        this.hasActiveConversation = true;
        await this.navigateToThread(thread.id, this.isNewChatRoute());
      }
    }
  }

  resizePromptInput(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  editMessage(messageId: string): void {
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (this.chatStore.isSaving()) return;

    const thread = this.chatStore.selectedThread();
    if (!thread?.messages.some((message) => message.id === messageId)) return;

    await this.chatStore.deleteMessage(messageId);
  }

  copyMessage(content: string): void {
  }

  retryMessage(messageId: string): void {
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
    }
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
      this.error = 'Open a book before starting a chat.';
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
}
