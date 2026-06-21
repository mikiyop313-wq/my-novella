import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import {
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
  CreateChatMessageDto,
  UpdateChatMessageDto,
  UpdateChatThreadDto,
} from '../../../../../shared/models/chat.model';
import { ChatService } from '../services/chat.service';

export interface ChatState {
  bookId: string | null;
  threads: ChatThreadDto[];
  selectedThread: ChatThreadDetailDto | null;
  isLoadingThreads: boolean;
  isLoadingThread: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: ChatState = {
  bookId: null,
  threads: [],
  selectedThread: null,
  isLoadingThreads: false,
  isLoadingThread: false,
  isSaving: false,
  error: null,
};

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const sortMessages = (messages: ChatMessageDetailDto[]): ChatMessageDetailDto[] =>
  [...messages].sort((first, second) => first.position - second.position);

export const ChatStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed(({ selectedThread }) => ({
    messages: computed(() => selectedThread()?.messages ?? []),
  })),

  withMethods((store, chatService = inject(ChatService)) => {
    function setSelectedThread(thread: ChatThreadDetailDto | null): void {
      patchState(store, { selectedThread: thread });
    }

    function patchThread(thread: ChatThreadDto): void {
      patchState(store, {
        threads: store.threads().map((item) => (item.id === thread.id ? thread : item)),
        selectedThread:
          store.selectedThread()?.id === thread.id
            ? { ...store.selectedThread()!, ...thread }
            : store.selectedThread(),
      });
    }

    function removeThread(threadId: string): void {
      patchState(store, {
        threads: store.threads().filter((thread) => thread.id !== threadId),
        selectedThread:
          store.selectedThread()?.id === threadId ? null : store.selectedThread(),
      });
    }

    function appendMessage(message: ChatMessageDetailDto): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread || selectedThread.id !== message.threadId) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          messages: sortMessages([...selectedThread.messages, message]),
        },
      });
    }

    function patchMessage(message: ChatMessageDetailDto): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread || selectedThread.id !== message.threadId) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          messages: sortMessages(
            selectedThread.messages.map((item) => (item.id === message.id ? message : item)),
          ),
        },
      });
    }

    function removeMessage(messageId: string): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          messages: selectedThread.messages.filter((message) => message.id !== messageId),
        },
      });
    }

    async function loadThreads(bookId: string, includeArchived = false): Promise<void> {
      patchState(store, {
        bookId,
        isLoadingThreads: true,
        error: null,
      });

      try {
        const threads = await chatService.getThreads(bookId, includeArchived);
        patchState(store, {
          threads,
          isLoadingThreads: false,
        });
      } catch (error) {
        patchState(store, {
          threads: [],
          isLoadingThreads: false,
          error: getErrorMessage(error, 'Failed to load chat threads.'),
        });
      }
    }

    async function openThread(threadId: string): Promise<void> {
      patchState(store, {
        isLoadingThread: true,
        error: null,
      });

      try {
        const thread = await chatService.getThread(threadId);
        if (!thread) {
          throw new Error('Chat thread not found.');
        }

        patchState(store, {
          selectedThread: thread,
          isLoadingThread: false,
        });
      } catch (error) {
        patchState(store, {
          selectedThread: null,
          isLoadingThread: false,
          error: getErrorMessage(error, 'Failed to load chat thread.'),
        });
      }
    }

    async function createThread(bookId: string, title?: string): Promise<ChatThreadDto | null> {
      patchState(store, {
        isSaving: true,
        error: null,
      });

      try {
        const thread = await chatService.createThread({
          bookId,
          ...(title ? { title } : {}),
        });

        patchState(store, {
          bookId,
          threads: [thread, ...store.threads().filter((item) => item.id !== thread.id)],
          selectedThread: { ...thread, messages: [] },
          isSaving: false,
        });

        return thread;
      } catch (error) {
        patchState(store, {
          isSaving: false,
          error: getErrorMessage(error, 'Failed to create chat thread.'),
        });
        return null;
      }
    }

    return {
      clear(): void {
        patchState(store, initialState);
      },

      async enterBook(bookId: string): Promise<void> {
        patchState(store, {
          bookId,
          selectedThread: null,
          threads: [],
          error: null,
        });

        await loadThreads(bookId);
      },

      loadThreads,

      openThread,

      closeThread(): void {
        setSelectedThread(null);
      },

      createThread,

      async updateThread(id: string, data: UpdateChatThreadDto): Promise<void> {
        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const thread = await chatService.updateThread(id, data);
          if (thread) {
            patchThread(thread);
          }
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to update chat thread.'),
          });
        }
      },

      async archiveThread(id: string): Promise<void> {
        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          await chatService.archiveThread(id);
          removeThread(id);
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to archive chat thread.'),
          });
        }
      },

      async deleteThread(id: string): Promise<void> {
        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          await chatService.deleteThread(id);
          removeThread(id);
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to delete chat thread.'),
          });
        }
      },

      async sendMessage(
        content: string,
        refs: Pick<CreateChatMessageDto, 'sceneIds' | 'codexEntryIds'> = {},
      ): Promise<void> {
        const trimmedContent = content.trim();
        if (!trimmedContent || store.isSaving()) return;

        let selectedThread = store.selectedThread();
        const bookId = store.bookId();

        if (!selectedThread) {
          if (!bookId) {
            patchState(store, { error: 'Open a book before starting a chat.' });
            return;
          }

          const thread = await createThread(bookId);
          if (!thread) return;

          selectedThread = { ...thread, messages: [] };
        }

        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const message = await chatService.createMessage({
            threadId: selectedThread.id,
            role: 'user',
            content: trimmedContent,
            ...refs,
          });

          appendMessage(message);
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to send chat message.'),
          });
        }
      },

      async updateMessage(id: string, data: UpdateChatMessageDto): Promise<void> {
        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const message = await chatService.updateMessage(id, data);
          if (message) {
            patchMessage(message);
          }
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to update chat message.'),
          });
        }
      },

      async deleteMessage(id: string): Promise<void> {
        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          await chatService.deleteMessage(id);
          removeMessage(id);
          patchState(store, { isSaving: false });
        } catch (error) {
          patchState(store, {
            isSaving: false,
            error: getErrorMessage(error, 'Failed to delete chat message.'),
          });
        }
      },
    };
  }),
);
