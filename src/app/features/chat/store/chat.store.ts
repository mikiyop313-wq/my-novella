import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import {
  ChatBranchSelectionDto,
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
  CreateChatMessageDto,
  UpdateChatMessageDto,
  UpdateChatThreadDto,
} from '../../../../../shared/models/chat.model';
import { ToastService } from '../../../shared/services/toast.service';
import { ChatService } from '../services/chat.service';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type LocalChatMessagePatch = Partial<
  Pick<
    ChatMessageDetailDto,
    | 'content'
    | 'status'
    | 'modelId'
    | 'provider'
    | 'inputTokens'
    | 'outputTokens'
    | 'reasoningSummary'
    | 'error'
  >
>;

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

// -----------------------------------------------------------------------------
// Local Helpers
// -----------------------------------------------------------------------------

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const sortMessages = (messages: ChatMessageDetailDto[]): ChatMessageDetailDto[] =>
  [...messages].sort(
    (first, second) =>
      first.position - second.position ||
      (first.branchOrder ?? 0) - (second.branchOrder ?? 0) ||
      first.createdAt.localeCompare(second.createdAt),
  );

const getBranchGroupId = (message: ChatMessageDetailDto): string =>
  message.branchGroupId ?? message.id;

const sortBranchMessages = (messages: ChatMessageDetailDto[]): ChatMessageDetailDto[] =>
  [...messages].sort(
    (first, second) =>
      (first.branchOrder ?? 0) - (second.branchOrder ?? 0) ||
      first.createdAt.localeCompare(second.createdAt) ||
      first.id.localeCompare(second.id),
  );

const upsertBranchSelection = (
  selections: ChatBranchSelectionDto[],
  selection: ChatBranchSelectionDto,
): ChatBranchSelectionDto[] => [
  ...selections.filter(
    (item) =>
      item.threadId !== selection.threadId || item.branchGroupId !== selection.branchGroupId,
  ),
  selection,
];

const ensureLocalBranchSelection = (
  selections: ChatBranchSelectionDto[],
  message: ChatMessageDetailDto,
): ChatBranchSelectionDto[] => {
  const branchGroupId = message.branchGroupId;
  if (!branchGroupId) return selections;

  // Locally appended branch messages should become visible immediately, even
  // before the persisted branch selection has been refreshed from storage.
  const hasSelection = selections.some(
    (selection) =>
      selection.threadId === message.threadId && selection.branchGroupId === branchGroupId,
  );

  if (hasSelection) return selections;

  return [
    ...selections,
    {
      threadId: message.threadId,
      branchGroupId,
      selectedMessageId: message.id,
    },
  ];
};

const computeVisibleMessages = (
  messages: ChatMessageDetailDto[],
  selections: ChatBranchSelectionDto[],
): ChatMessageDetailDto[] => {
  // Rebuild the active conversation path by following the selected branch at
  // each parent message.
  const sortedMessages = sortMessages(messages);

  const messagesByParent = new Map<string | null, ChatMessageDetailDto[]>();
  const selectedByGroup = new Map<string, string>();

  for (const selection of selections) {
    selectedByGroup.set(selection.branchGroupId, selection.selectedMessageId);
  }

  for (const message of sortedMessages) {
    const parentId = message.parentMessageId ?? null;
    messagesByParent.set(parentId, [...(messagesByParent.get(parentId) ?? []), message]);
  }

  const visible: ChatMessageDetailDto[] = [];
  let parentId: string | null = null;
  const visitedParentIds = new Set<string | null>();

  while (!visitedParentIds.has(parentId)) {
    visitedParentIds.add(parentId);

    const children = messagesByParent.get(parentId) ?? [];
    if (children.length === 0) break;

    // A branch group represents alternate messages at the same conversation step.
    // Pick the selected branch, then continue walking from that message.
    const firstGroupId = getBranchGroupId(children[0]);
    const siblings = sortBranchMessages(
      children.filter((message) => getBranchGroupId(message) === firstGroupId),
    );

    const selectedMessageId = selectedByGroup.get(firstGroupId);
    const selectedMessage =
      siblings.find((message) => message.id === selectedMessageId) ?? siblings[0];
    if (!selectedMessage) break;

    visible.push(selectedMessage);
    parentId = selectedMessage.id;
  }

  return visible;
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const ChatStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withComputed(({ selectedThread }) => ({
    messages: computed(() => selectedThread()?.messages ?? []),
    visibleMessages: computed(() => {
      const thread = selectedThread();
      return thread ? computeVisibleMessages(thread.messages, thread.branchSelections) : [];
    }),
  })),

  withMethods((store, chatService = inject(ChatService), toastService = inject(ToastService)) => {
    // -------------------------------------------------------------------------
    // State Mutation Helpers
    // -------------------------------------------------------------------------

    function setError(message: string, state: Partial<ChatState> = {}): void {
      patchState(store, { ...state, error: message });
      toastService.error(message, 'Chat');
    }

    function reportError(error: unknown, fallback: string, state: Partial<ChatState> = {}): void {
      setError(getErrorMessage(error, fallback), state);
    }

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
        selectedThread: store.selectedThread()?.id === threadId ? null : store.selectedThread(),
      });
    }

    function appendMessage(message: ChatMessageDetailDto): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread || selectedThread.id !== message.threadId) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          messages: sortMessages([...selectedThread.messages, message]),
          branchSelections: ensureLocalBranchSelection(selectedThread.branchSelections, message),
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

    function patchMessageFields(messageId: string, data: LocalChatMessagePatch): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          messages: sortMessages(
            selectedThread.messages.map((item) =>
              item.id === messageId ? { ...item, ...data } : item,
            ),
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
          branchSelections: selectedThread.branchSelections.filter(
            (selection) => selection.selectedMessageId !== messageId,
          ),
        },
      });
    }

    function patchBranchSelection(selection: ChatBranchSelectionDto): void {
      const selectedThread = store.selectedThread();
      if (!selectedThread || selectedThread.id !== selection.threadId) return;

      patchState(store, {
        selectedThread: {
          ...selectedThread,
          branchSelections: upsertBranchSelection(selectedThread.branchSelections, selection),
        },
      });
    }

    function getMessageBranches(message: ChatMessageDetailDto): ChatMessageDetailDto[] {
      const branchGroupId = getBranchGroupId(message);
      return sortBranchMessages(
        store.messages().filter((item) => getBranchGroupId(item) === branchGroupId),
      );
    }

    // -------------------------------------------------------------------------
    // Thread Request Helpers
    // -------------------------------------------------------------------------

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
        reportError(error, 'Failed to load chat threads.', {
          threads: [],
          isLoadingThreads: false,
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
        reportError(error, 'Failed to load chat thread.', {
          selectedThread: null,
          isLoadingThread: false,
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
          selectedThread: { ...thread, messages: [], branchSelections: [] },
          isSaving: false,
        });

        return thread;
      } catch (error) {
        reportError(error, 'Failed to create chat thread.', {
          isSaving: false,
        });
        return null;
      }
    }

    return {
      // -----------------------------------------------------------------------
      // Book and Thread Actions
      // -----------------------------------------------------------------------

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
          reportError(error, 'Failed to update chat thread.', {
            isSaving: false,
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
          reportError(error, 'Failed to archive chat thread.', {
            isSaving: false,
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
          reportError(error, 'Failed to delete chat thread.', {
            isSaving: false,
          });
        }
      },

      // -----------------------------------------------------------------------
      // Message Actions
      // -----------------------------------------------------------------------

      async sendMessage(
        content: string,
        refs: Pick<
          CreateChatMessageDto,
          'includeFullOutline' | 'sceneIds' | 'codexEntryIds'
        > = {},
      ): Promise<ChatMessageDetailDto | null> {
        const trimmedContent = content.trim();
        if (!trimmedContent || store.isSaving()) return null;

        let selectedThread = store.selectedThread();
        const bookId = store.bookId();

        if (!selectedThread) {
          if (!bookId) {
            setError('Open a book before starting a chat.');
            return null;
          }

          const thread = await createThread(bookId);
          if (!thread) return null;

          selectedThread = { ...thread, messages: [], branchSelections: [] };
        }

        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const message = await chatService.createMessage({
            threadId: selectedThread.id,
            parentMessageId: store.visibleMessages().at(-1)?.id ?? null,
            branchGroupId: crypto.randomUUID(),
            branchOrder: 0,
            role: 'user',
            content: trimmedContent,
            ...refs,
          });

          appendMessage(message);
          patchState(store, { isSaving: false });
          return message;
        } catch (error) {
          reportError(error, 'Failed to send chat message.', {
            isSaving: false,
          });
          return null;
        }
      },

      async createAssistantMessage(
        data: Partial<
          Pick<
            CreateChatMessageDto,
            | 'threadId'
            | 'modelId'
            | 'provider'
            | 'reasoningSummary'
            | 'parentMessageId'
            | 'branchGroupId'
            | 'branchOrder'
          >
        > = {},
      ): Promise<ChatMessageDetailDto | null> {
        const selectedThread = store.selectedThread();
        const threadId = data.threadId ?? selectedThread?.id;

        if (!threadId) {
          setError('Open a chat thread before generating a response.');
          return null;
        }

        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const message = await chatService.createMessage({
            threadId,
            parentMessageId: data.parentMessageId ?? null,
            branchGroupId: data.branchGroupId ?? crypto.randomUUID(),
            ...(data.branchOrder !== undefined ? { branchOrder: data.branchOrder } : {}),
            role: 'assistant',
            content: '',
            status: 'streaming',
            modelId: data.modelId ?? null,
            provider: data.provider ?? null,
            reasoningSummary: data.reasoningSummary ?? null,
          });

          appendMessage(message);
          patchState(store, { isSaving: false });
          return message;
        } catch (error) {
          reportError(error, 'Failed to create AI response.', {
            isSaving: false,
          });
          return null;
        }
      },

      async createMessageBranch(
        sourceMessageId: string,
        content: string,
      ): Promise<ChatMessageDetailDto | null> {
        const selectedThread = store.selectedThread();
        const trimmedContent = content.trim();
        if (!selectedThread || !trimmedContent || store.isSaving()) return null;

        const sourceMessage = selectedThread.messages.find(
          (message) => message.id === sourceMessageId,
        );
        if (!sourceMessage) return null;

        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const message = await chatService.createMessage({
            threadId: selectedThread.id,
            parentMessageId: sourceMessage.parentMessageId,
            branchGroupId: sourceMessage.branchGroupId ?? sourceMessage.id,
            role: sourceMessage.role,
            content: trimmedContent,
            status: 'complete',
            includeFullOutline: sourceMessage.includeFullOutline,
            sceneIds: sourceMessage.sceneRefs.map((ref) => ref.sceneId),
            codexEntryIds: sourceMessage.codexRefs.map((ref) => ref.codexEntryId),
          });

          appendMessage(message);
          patchState(store, { isSaving: false });
          return message;
        } catch (error) {
          reportError(error, 'Failed to create message branch.', {
            isSaving: false,
          });
          return null;
        }
      },

      // -----------------------------------------------------------------------
      // Message Updates
      // -----------------------------------------------------------------------

      patchStreamingMessage(id: string, data: LocalChatMessagePatch): void {
        patchMessageFields(id, data);
      },

      async updateMessage(
        id: string,
        data: UpdateChatMessageDto,
      ): Promise<ChatMessageDetailDto | null> {
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
          return message ?? null;
        } catch (error) {
          reportError(error, 'Failed to update chat message.', {
            isSaving: false,
          });
          return null;
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
          reportError(error, 'Failed to delete chat message.', {
            isSaving: false,
          });
        }
      },

      // -----------------------------------------------------------------------
      // Branch Navigation
      // -----------------------------------------------------------------------

      getMessageBranches,

      getMessageBranchCount(message: ChatMessageDetailDto): number {
        return getMessageBranches(message).length;
      },

      getMessageBranchIndex(message: ChatMessageDetailDto): number {
        const branchIndex = getMessageBranches(message).findIndex(
          (branch) => branch.id === message.id,
        );

        return branchIndex === -1 ? 1 : branchIndex + 1;
      },

      async selectMessageBranch(messageId: string): Promise<boolean> {
        const selectedThread = store.selectedThread();
        if (!selectedThread || store.isSaving()) return false;

        const message = selectedThread.messages.find((item) => item.id === messageId);
        const branchGroupId = message?.branchGroupId;
        if (!message || !branchGroupId) return false;

        patchState(store, {
          isSaving: true,
          error: null,
        });

        try {
          const selection = await chatService.selectBranch(
            selectedThread.id,
            branchGroupId,
            message.id,
          );
          patchBranchSelection(selection);
          patchState(store, { isSaving: false });
          return true;
        } catch (error) {
          reportError(error, 'Failed to select chat branch.', {
            isSaving: false,
          });
          return false;
        }
      },

      async selectAdjacentMessageBranch(messageId: string, direction: -1 | 1): Promise<void> {
        const selectedThread = store.selectedThread();
        if (!selectedThread || store.isSaving()) return;

        const message = selectedThread.messages.find((item) => item.id === messageId);
        if (!message) return;

        const branchGroupId = message.branchGroupId;
        if (!branchGroupId) return;

        const branches = getMessageBranches(message);
        if (branches.length <= 1) return;

        const currentIndex = Math.max(
          0,
          branches.findIndex((branch) => branch.id === message.id),
        );
        const nextIndex = (currentIndex + direction + branches.length) % branches.length;
        const nextMessage = branches[nextIndex];
        if (!nextMessage || nextMessage.id === message.id) return;

        await this.selectMessageBranch(nextMessage.id);
      },
    };
  }),
);
