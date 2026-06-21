import { Component, input, output } from '@angular/core';
import { CdkMenuModule } from '@angular/cdk/menu';

import { type ChatThreadDto } from '../../../../../../shared/models/chat.model';

@Component({
  selector: 'app-chat-threads',
  standalone: true,
  imports: [CdkMenuModule],
  templateUrl: './chat-threads.html',
  styleUrl: './chat-threads.scss'
})
export class ChatThreads {
  readonly threads = input<ChatThreadDto[]>([]);
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
    this.deleteThreadRequested.emit(id);
  }

  archiveThread(id: string): void {
    this.archiveThreadRequested.emit(id);
  }

  startRename(id: string): void {
    this.editingThreadId = id;
    setTimeout(() => {
      const input = document.querySelector('.thread-title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
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

  getThreadInitial(title: string): string {
    return title.trim().charAt(0).toUpperCase() || 'C';
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
}
