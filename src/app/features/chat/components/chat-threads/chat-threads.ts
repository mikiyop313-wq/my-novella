import { Component, ElementRef, Injector, ViewChild, afterNextRender, inject, input, output } from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';

import { type ChatThreadDto } from '../../../../../../shared/models/chat.model';
import { ElementAnimationDirective } from '../../../../shared/directives/element-animation.directive';

@Component({
  selector: 'app-chat-threads',
  standalone: true,
  imports: [CdkMenuModule, ElementAnimationDirective],
  templateUrl: './chat-threads.html',
  styleUrl: './chat-threads.scss'
})
export class ChatThreads {

  @ViewChild('renameInput') private renameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('threadsAnimation') private threadsAnimation?: ElementAnimationDirective;

  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly threads = input<ChatThreadDto[]>([]);
  readonly generatingThreadIds = input<ReadonlySet<string>>(new Set());
  readonly isDetachedMode = input(false);
  readonly canDetach = input(true);
  readonly isNewChat = input(false);
  
  readonly threadSelected = output<string>();
  readonly newConversationRequested = output<void>();
  readonly detachRequested = output<void>();
  readonly deleteThreadRequested = output<string>();
  readonly archiveThreadRequested = output<string>();
  readonly renameThreadRequested = output<{id: string, title: string}>();

  isSidebarOpen = true;
  editingThreadId: string | null = null;

  onThreadClick(id: string, event?: Event): void {
    if (this.editingThreadId === id) {
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }

    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    this.threadSelected.emit(id);
  }

  startNewConversation(): void {
    this.newConversationRequested.emit();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  detachChat(): void {
    this.detachRequested.emit();
  }

  deleteThread(id: string): void {
    if (this.isThreadGenerating(id)) return;

    this.deleteThreadRequested.emit(id);
  }

  archiveThread(id: string): void {
    if (this.isThreadGenerating(id)) return;

    this.archiveThreadRequested.emit(id);
  }

  isThreadGenerating(id: string): boolean {
    return this.generatingThreadIds().has(id);
  }

  getManagementTooltip(id: string, action: 'archive' | 'delete'): string {
    if (!this.isThreadGenerating(id)) return action === 'archive' ? 'Archive' : 'Delete';

    return `Stop or wait for generation to finish before ${action === 'archive' ? 'archiving' : 'deleting'} this thread.`;
  }

  async animateThreadRemoval(id: string, removeThread: () => Promise<void>): Promise<void> {
    const threadElement = this.getThreadElement(id);
    if (!this.threadsAnimation || !threadElement) {
      await removeThread();
      return;
    }

    await this.threadsAnimation.animateBeforeDelete(threadElement, removeThread);
  }

  startRename(id: string): void {
    this.editingThreadId = id;
    afterNextRender(() => {
      const input = this.renameInput?.nativeElement;
      input?.focus();
      input?.select();
    }, { injector: this.injector });
  }

  saveRename(id: string, newTitle: string, currentTitle: string): void {
    if (this.editingThreadId !== id) return;
    
    this.editingThreadId = null;
    const trimmed = newTitle.trim();
    if (trimmed !== '' && trimmed !== currentTitle) {
      this.renameThreadRequested.emit({ id, title: trimmed });
    }
  }

  saveRenameFromKeyboard(id: string, newTitle: string, currentTitle: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.saveRename(id, newTitle, currentTitle);
  }

  cancelRename(): void {
    this.editingThreadId = null;
  }

  cancelRenameFromKeyboard(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancelRename();
  }

  formatThreadDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Recent';
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }

  /** Returns a thread wrapper from this component's own DOM tree. */
  private getThreadElement(id: string): HTMLElement | undefined {
    const threadElements = (
      this.hostElement.nativeElement.querySelectorAll('[data-thread-id]')
    ) as NodeListOf<HTMLElement>;

    return Array.from(threadElements)
      .find((element) => element.dataset['threadId'] === id);
  }
}
