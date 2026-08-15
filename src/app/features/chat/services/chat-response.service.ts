import { Injectable, computed, inject, signal } from '@angular/core';

import {
  type ChatMessageDetailDto,
  type ChatThreadDetailDto,
} from '../../../../../shared/models/chat.model';
import { AiStore } from '../../../core/store/ai.store';
import { AiGenerationSessionService } from '../../../core/services/ai-generation-session.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  buildAiPrompt,
  type AiPromptMessageInput,
  type BuiltAiPrompt,
} from '../../../shared/utils/ai-prompt-builder';
import { resolveAiModelTarget } from '../../../shared/utils/ai-model-selection';
import { WorkspaceBookStore } from '../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../workspace/workspace.store';
import {
  ChatAiContextService,
  type ChatAiContextRequest,
} from './chat-ai-context.service';
import { ChatStore } from '../store/chat.store';

const DEFAULT_CHAT_THREAD_TITLE = 'New chat';

export interface ChatResponseSettings {
  selectedModelId: string | null;
  reasoningMode: boolean;
  context: Pick<
    ChatAiContextRequest,
    'includeBookMetadata' | 'bookContext' | 'includeFullOutline' | 'sceneIds' | 'codexEntryIds'
  >;
  branchGroupId?: string;
  selectCreatedBranch?: boolean;
}

interface ResolvedModel {
  provider: string;
  modelId: string;
}

interface ActiveChatResponse {
  threadId: string;
  streamId: string;
  assistantMessageId: string | null;
  sessionId: string | null;
  stopping: boolean;
}

/**
 * Owns the active chat AI-response lifecycle so route changes can preserve
 * generation state until the stream completes or is stopped.
 */
@Injectable({ providedIn: 'root' })
export class ChatResponseService {
  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  private readonly aiStore = inject(AiStore);
  private readonly generationSessions = inject(AiGenerationSessionService);
  private readonly chatAiContext = inject(ChatAiContextService);
  private readonly chatStore = inject(ChatStore);
  private readonly toastService = inject(ToastService);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  // ---------------------------------------------------------------------------
  // Response State
  // ---------------------------------------------------------------------------

  private readonly activeResponses = signal<ReadonlyMap<string, ActiveChatResponse>>(new Map());
  private readonly responseRenderVersion = signal(0);

  readonly generatingThreadIds = computed<ReadonlySet<string>>(
    () => new Set(this.activeResponses().keys()),
  );
  readonly renderVersion = this.responseRenderVersion.asReadonly();

  // ---------------------------------------------------------------------------
  // Public Generation API
  // ---------------------------------------------------------------------------

  /** Streams and persists an assistant response for the given user message. */
  async generateResponse(
    userMessage: ChatMessageDetailDto,
    prompt: string,
    settings: ChatResponseSettings,
  ): Promise<void> {
    const threadId = userMessage.threadId;
    if (this.isThreadGenerating(threadId)) return;

    const bookId = this.chatStore.bookId();
    if (!bookId) {
      this.toastService.error('No active book is available.', 'AI Generation');
      return;
    }

    const { provider, modelId } = this.resolveSelectedModel(settings.selectedModelId);
    const selectedThread = this.chatStore.selectedThread();
    const threadMessages = [...this.chatStore.visibleMessages()];
    const shouldGenerateTitle = this.shouldGenerateThreadTitle(
      selectedThread,
      userMessage,
      threadMessages,
    );
    const titleBookId = shouldGenerateTitle ? selectedThread.bookId : null;
    const streamId = `pending-${userMessage.id}`;
    this.setActiveResponse({
      threadId,
      streamId,
      assistantMessageId: null,
      sessionId: null,
      stopping: false,
    });
    this.requestRender();

    let aiPrompt: BuiltAiPrompt;
    try {
      aiPrompt = await this.buildChatAiPrompt(
        userMessage,
        prompt,
        settings.context,
        threadMessages,
        bookId,
      );
    } catch (error) {
      console.error('[ChatResponseService] AI context preparation failed:', error);
      this.toastService.error(
        'Could not prepare the selected story context.',
        'AI Context',
      );
      this.clearActiveResponse(threadId, streamId);
      return;
    }

    let assistantMessage: ChatMessageDetailDto | null = null;
    let assistantMessagePromise: Promise<ChatMessageDetailDto | null> | null = null;
    let lastStreamingPatch: Promise<void> = Promise.resolve();
    let streamedContent = '';
    let reasoningSummary = '';

    // Do not create an empty assistant message until the stream has useful
    // output, but keep one shared promise once creation starts.
    const ensureAssistantMessage = (): Promise<ChatMessageDetailDto | null> => {
      if (assistantMessage) return Promise.resolve(assistantMessage);

      if (!assistantMessagePromise) {
        assistantMessagePromise = this.chatStore
          .createAssistantMessage({
            threadId,
            parentMessageId: userMessage.id,
            provider,
            modelId,
            ...(settings.branchGroupId ? { branchGroupId: settings.branchGroupId } : {}),
          })
          .then(async (message) => {
            if (
              message &&
              settings.selectCreatedBranch &&
              this.chatStore.selectedThread()?.id === threadId
            ) {
              await this.chatStore.selectMessageBranch(message.id);
            }

            assistantMessage = message;
            this.patchActiveResponse(threadId, streamId, {
              assistantMessageId: message?.id ?? null,
            });
            return message;
          });
      }

      return assistantMessagePromise;
    };

    // Stream callbacks can arrive faster than state writes complete. Chain each
    // patch so content and reasoning updates stay in order.
    const queueStreamingPatch = (
      data: Partial<Pick<ChatMessageDetailDto, 'content' | 'reasoningSummary'>>,
    ): void => {
      lastStreamingPatch = lastStreamingPatch
        .catch(() => undefined)
        .then(async () => {
          const message = await ensureAssistantMessage();
          if (!message) return;

          this.chatStore.patchStreamingMessage(message.id, data);
          this.requestRender();
        });
    };

    try {
      const session = this.generationSessions.start({
        streamId,
        source: 'chat-response',
        scopeId: threadId,
        bookId,
        aiPrompt,
        provider,
        modelId: modelId ?? undefined,
        reasoningMode: settings.reasoningMode,
        onContentChange: (content) => {
          streamedContent = content;
          if (!streamedContent.trim()) return;

          queueStreamingPatch({
            content: streamedContent,
            ...(reasoningSummary.trim() ? { reasoningSummary } : {}),
          });
        },
        onReasoningChange: (reasoningText) => {
          reasoningSummary = reasoningText;
          if (assistantMessage || assistantMessagePromise) {
            queueStreamingPatch({ reasoningSummary });
          }
        },
      });
      if (!session) return;
      this.patchActiveResponse(threadId, streamId, { sessionId: session.id });

      const result = await session.completion;

      await lastStreamingPatch;

      streamedContent = result.content;
      reasoningSummary = result.reasoning;
      const finalContent = result.content;

      if (result.status === 'failed') {
        throw result.error ?? new Error('Failed to generate AI response.');
      }

      // Some providers can finish without returning visible content. In that
      // case there is no assistant message worth showing or persisting.
      if (!finalContent.trim()) {
        return;
      }

      assistantMessage = assistantMessage ?? (await ensureAssistantMessage());
      await lastStreamingPatch;
      if (!assistantMessage) return;

      const finalReasoningSummary = this.getReasoningSummary(reasoningSummary);
      const data = {
        content: finalContent,
        status: result.status === 'stopped' ? 'aborted' as const : 'complete' as const,
        modelId,
        provider,
        reasoningSummary: finalReasoningSummary,
        error: null,
      };

      this.chatStore.patchStreamingMessage(assistantMessage.id, data);
      this.requestRender();

      // The local patch keeps the UI responsive; the update persists the final
      // status and metadata once streaming has settled.
      await this.chatStore.updateMessage(assistantMessage.id, data);
      this.generationSessions.release(streamId);
      if (result.status === 'complete' && shouldGenerateTitle && titleBookId) {
        await this.generateThreadTitle(userMessage, titleBookId, provider, modelId);
      }
    } catch (error) {
      await lastStreamingPatch;

      if (!assistantMessage && streamedContent.trim()) {
        assistantMessage = await ensureAssistantMessage();
      }

      if (!assistantMessage) return;

      const message = error instanceof Error ? error.message : 'Failed to generate AI response.';
      const data = {
        content: streamedContent,
        status: 'failed' as const,
        modelId,
        provider,
        reasoningSummary: this.getReasoningSummary(reasoningSummary),
        error: message,
      };

      // AIStateService owns the provider-facing toast; preserve the detail on
      // the message without raising a duplicate notification here.
      this.chatStore.patchStreamingMessage(assistantMessage.id, data);
      this.requestRender();
      await this.chatStore.updateMessage(assistantMessage.id, data);
    } finally {
      this.generationSessions.release(streamId);
      this.clearActiveResponse(threadId, streamId);
      this.requestRender();
    }
  }

  isThreadGenerating(threadId: string | null | undefined): boolean {
    const activeResponses = this.activeResponses();
    return !!threadId && activeResponses.has(threadId);
  }

  isThreadStopping(threadId: string | null | undefined): boolean {
    const activeResponses = this.activeResponses();
    return !!threadId && activeResponses.get(threadId)?.stopping === true;
  }

  rehydrateThread(threadId: string): void {
    const activeResponse = this.activeResponses().get(threadId);
    if (!activeResponse?.assistantMessageId || !activeResponse.sessionId) return;

    const session = this.generationSessions.getSession(activeResponse.sessionId);
    if (!session) return;

    this.chatStore.patchStreamingMessage(activeResponse.assistantMessageId, {
      content: session.content(),
      reasoningSummary: this.getReasoningSummary(session.reasoning()),
    });
    this.requestRender();
  }

  /** Stops one thread's active response and returns a displayable error when aborting fails. */
  async stopResponse(threadId: string): Promise<string | null> {
    const activeResponse = this.activeResponses().get(threadId);
    if (!activeResponse || activeResponse.stopping) return null;

    this.patchActiveResponse(threadId, activeResponse.streamId, { stopping: true });
    try {
      await this.generationSessions.stop(activeResponse.streamId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to stop the AI response.';
    } finally {
      this.patchActiveResponse(threadId, activeResponse.streamId, { stopping: false });
    }
  }

  async retryMessage(messageId: string, settings: ChatResponseSettings): Promise<void> {
    if (this.chatStore.isSaving()) return;

    const assistantMessage = this.chatStore
      .visibleMessages()
      .find((message) => message.id === messageId);
    if (!assistantMessage || assistantMessage.role !== 'assistant') return;
    if (this.isThreadGenerating(assistantMessage.threadId)) return;

    const userMessage = this.chatStore
      .messages()
      .find(
        (message) => message.id === assistantMessage.parentMessageId && message.role === 'user',
      );
    if (!userMessage) return;

    await this.retryResponseForUser(userMessage, settings);
  }

  async retryResponseForUser(
    userMessage: ChatMessageDetailDto,
    settings: Omit<ChatResponseSettings, 'branchGroupId' | 'selectCreatedBranch'>,
  ): Promise<void> {
    const previousResponse = this.getVisibleAssistantResponse(userMessage.id);

    await this.generateResponse(userMessage, userMessage.content, {
      ...settings,
      ...(previousResponse
        ? {
            branchGroupId: previousResponse.branchGroupId ?? previousResponse.id,
            selectCreatedBranch: true,
          }
        : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async buildChatAiPrompt(
    userMessage: ChatMessageDetailDto,
    prompt: string,
    contextSelection: ChatResponseSettings['context'],
    threadMessages: readonly ChatMessageDetailDto[],
    bookId: string,
  ): Promise<BuiltAiPrompt> {
    const userMessageIndex = threadMessages.findIndex((message) => message.id === userMessage.id);
    const messages =
      userMessageIndex === -1
        ? [...threadMessages, userMessage]
        : threadMessages.slice(0, userMessageIndex + 1);

    // Send only the active branch up to the requested user message. Draft,
    // failed, and empty messages are excluded from provider context.
    const includedMessages = messages
      .filter(
        (message) =>
          (message.status === 'complete' || message.id === userMessage.id) &&
          message.content.trim().length > 0,
      );
    const context = await this.chatAiContext.buildContext({
      ...contextSelection,
      bookId,
      bookTitle: this.workspaceStore.bookId() === bookId
        ? this.workspaceStore.bookTitle()
        : undefined,
      hierarchy: this.workspaceBookStore.bookHierarchy(),
    });

    const promptMessages: AiPromptMessageInput[] = includedMessages.flatMap((message) => {
      const aiMessage: AiPromptMessageInput = {
        role: message.role,
        parts: [{
          type: 'text',
          content: message.id === userMessage.id ? prompt : message.content,
        }],
      };
      const contextMessage: AiPromptMessageInput = {
        role: 'user',
        parts: [{ type: 'section', name: 'STORY CONTEXT', content: context ?? '' }],
      };

      return context && message.id === userMessage.id
        ? [contextMessage, aiMessage]
        : [aiMessage];
    });

    return buildAiPrompt({ requestType: 'chat', messages: promptMessages });
  }

  private async generateThreadTitle(
    userMessage: ChatMessageDetailDto,
    bookId: string,
    provider: string,
    modelId: string | null,
  ): Promise<void> {
    try {
      const streamId = `title-${userMessage.id}`;
      const session = this.generationSessions.start({
        streamId,
        source: 'chat-title',
        scopeId: userMessage.threadId,
        bookId,
        aiPrompt: buildAiPrompt({
          requestType: 'title',
          messages: [{
            role: 'user',
            parts: [{ type: 'text', content: userMessage.content }],
          }],
        }),
        provider,
        modelId: modelId ?? undefined,
        reasoningMode: false,
      });
      if (!session) return;

      const result = await session.completion;
      if (result.status === 'failed') {
        throw result.error ?? new Error('Failed to generate chat thread title.');
      }

      const title = this.normalizeThreadTitle(result.content);

      if (title) {
        await this.chatStore.updateThread(userMessage.threadId, { title });
      }
    } catch (error) {
      // Title generation is opportunistic and should not fail the response.
      console.warn('[ChatResponseService] Failed to generate chat thread title:', error);
    } finally {
      const streamId = `title-${userMessage.id}`;
      this.generationSessions.release(streamId);
    }
  }

  private shouldGenerateThreadTitle(
    thread: ChatThreadDetailDto | null,
    userMessage: ChatMessageDetailDto,
    threadMessages: readonly ChatMessageDetailDto[],
  ): thread is ChatThreadDetailDto {
    if (
      !thread ||
      thread.id !== userMessage.threadId ||
      thread.title.trim() !== DEFAULT_CHAT_THREAD_TITLE
    )
      return false;

    const userMessages = threadMessages
      .filter(
        (message) =>
          message.role === 'user' &&
          message.content.trim().length > 0 &&
          (message.status === 'complete' || message.id === userMessage.id),
      );

    return userMessages.length === 1 && userMessages[0].id === userMessage.id;
  }

  private normalizeThreadTitle(rawTitle: string): string | null {
    const firstLine =
      rawTitle
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? '';
    let title = firstLine
      .replace(/^title\s*:\s*/i, '')
      .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[.!?]+$/g, '')
      .trim();

    if (!title || title === DEFAULT_CHAT_THREAD_TITLE) return null;

    if (title.length > 80) {
      title = title
        .slice(0, 80)
        .trim()
        .replace(/[,;:-]+$/g, '')
        .trim();
    }

    return title || null;
  }

  private getVisibleAssistantResponse(userMessageId: string): ChatMessageDetailDto | null {
    const messages = this.chatStore.visibleMessages();
    const userMessageIndex = messages.findIndex((message) => message.id === userMessageId);
    const assistantMessage = userMessageIndex === -1 ? null : messages[userMessageIndex + 1];

    return assistantMessage?.role === 'assistant' &&
      assistantMessage.parentMessageId === userMessageId
      ? assistantMessage
      : null;
  }

  private resolveSelectedModel(selectedModelId: string | null): ResolvedModel {
    if (!selectedModelId) {
      throw new Error('Select an available AI model before generating.');
    }

    const selectedModel = this.aiStore.models().find((model) => model.id === selectedModelId);
    if (!selectedModel) {
      throw new Error('The selected AI model is no longer available.');
    }

    return resolveAiModelTarget(selectedModel);
  }

  private getReasoningSummary(reasoningSummary: string): string | null {
    return reasoningSummary.trim().length > 0 ? reasoningSummary : null;
  }

  private setActiveResponse(response: ActiveChatResponse): void {
    this.activeResponses.update(responses => {
      const nextResponses = new Map(responses);
      nextResponses.set(response.threadId, response);
      return nextResponses;
    });
  }

  private patchActiveResponse(
    threadId: string,
    streamId: string,
    patch: Partial<Pick<ActiveChatResponse, 'assistantMessageId' | 'sessionId' | 'stopping'>>,
  ): void {
    const activeResponse = this.activeResponses().get(threadId);
    if (!activeResponse || activeResponse.streamId !== streamId) return;

    this.setActiveResponse({ ...activeResponse, ...patch });
  }

  private clearActiveResponse(threadId: string, streamId: string): void {
    const activeResponse = this.activeResponses().get(threadId);
    if (!activeResponse || activeResponse.streamId !== streamId) return;

    this.activeResponses.update(responses => {
      const nextResponses = new Map(responses);
      nextResponses.delete(threadId);
      return nextResponses;
    });
  }

  private requestRender(): void {
    this.responseRenderVersion.update((version) => version + 1);
  }
}
