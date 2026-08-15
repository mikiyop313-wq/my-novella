import { Injectable, inject, signal } from '@angular/core';

import { type AiModel } from '../../../../../shared/models/ai.model';
import {
  type ChatMessageDetailDto,
  type ChatThreadDetailDto,
} from '../../../../../shared/models/chat.model';
import { AiStore } from '../../../core/store/ai.store';
import { type AiChatMessage } from '../../../core/services/ai-state.service';
import { AiStreamService } from '../../../core/services/ai-stream.service';
import { ToastService } from '../../../shared/services/toast.service';
import { WorkspaceBookStore } from '../../workspace/workspace-book.store';
import { WorkspaceStore } from '../../workspace/workspace.store';
import { ChatAiContextService } from './chat-ai-context.service';
import { ChatStore } from '../store/chat.store';

const DEFAULT_CHAT_THREAD_TITLE = 'New chat';

export interface ChatResponseSettings {
  selectedModelId: string | null;
  reasoningMode: boolean;
  branchGroupId?: string;
  selectCreatedBranch?: boolean;
}

interface ResolvedModel {
  provider: string;
  modelId: string | null;
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
  private readonly aiStreamService = inject(AiStreamService);
  private readonly chatAiContext = inject(ChatAiContextService);
  private readonly chatStore = inject(ChatStore);
  private readonly toastService = inject(ToastService);
  private readonly workspaceBookStore = inject(WorkspaceBookStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  // ---------------------------------------------------------------------------
  // Response State
  // ---------------------------------------------------------------------------

  private readonly generatingResponse = signal(false);
  private readonly stoppingResponse = signal(false);
  private readonly responseRenderVersion = signal(0);
  private activeStreamId: string | null = null;

  readonly isGeneratingResponse = this.generatingResponse.asReadonly();
  readonly isStoppingResponse = this.stoppingResponse.asReadonly();
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
    if (this.generatingResponse()) return;

    const bookId = this.chatStore.bookId();
    if (!bookId) {
      this.toastService.error('No active book is available.', 'AI Generation');
      return;
    }

    const { provider, modelId } = this.resolveSelectedModel(settings.selectedModelId);
    let messages: AiChatMessage[];
    try {
      messages = await this.buildAiMessages(userMessage);
    } catch (error) {
      console.error('[ChatResponseService] AI context preparation failed:', error);
      this.toastService.error(
        'Could not prepare the selected story context.',
        'AI Context',
      );
      return;
    }
    const streamId = `pending-${userMessage.id}`;
    const threadId = userMessage.threadId;
    const selectedThread = this.chatStore.selectedThread();
    const shouldGenerateTitle = this.shouldGenerateThreadTitle(selectedThread, userMessage);
    const titleBookId = shouldGenerateTitle ? selectedThread.bookId : null;

    let assistantMessage: ChatMessageDetailDto | null = null;
    let assistantMessagePromise: Promise<ChatMessageDetailDto | null> | null = null;
    let lastStreamingPatch: Promise<void> = Promise.resolve();
    let streamedContent = '';
    let reasoningSummary = '';

    this.activeStreamId = streamId;
    this.generatingResponse.set(true);
    this.requestRender();

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
      const generatedText = await this.aiStreamService.streamText({
        streamId,
        bookId,
        systemPromptCategory: 'chat',
        prompt,
        messages,
        provider,
        modelId: modelId ?? undefined,
        reasoningMode: settings.reasoningMode,
        onToken: (token) => {
          streamedContent += token;
          if (!streamedContent.trim()) return;

          queueStreamingPatch({
            content: streamedContent,
            ...(reasoningSummary.trim() ? { reasoningSummary } : {}),
          });
        },
        onReasoningUpdate: (reasoningText) => {
          reasoningSummary = reasoningText;
          if (assistantMessage || assistantMessagePromise) {
            queueStreamingPatch({ reasoningSummary });
          }
        },
      });

      await lastStreamingPatch;

      const finalContent = streamedContent || generatedText;

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
        status: 'complete' as const,
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
      if (shouldGenerateTitle && titleBookId) {
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
      this.generatingResponse.set(false);
      if (this.activeStreamId === streamId) {
        this.activeStreamId = null;
      }
      this.requestRender();
    }
  }

  /** Stops the active response and returns a displayable error when aborting fails. */
  async stopResponse(): Promise<string | null> {
    if (!this.activeStreamId || this.stoppingResponse()) return null;

    this.stoppingResponse.set(true);
    try {
      await this.aiStreamService.stopStream(this.activeStreamId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to stop the AI response.';
    } finally {
      this.stoppingResponse.set(false);
    }
  }

  async retryMessage(messageId: string, settings: ChatResponseSettings): Promise<void> {
    if (this.chatStore.isSaving() || this.generatingResponse()) return;

    const assistantMessage = this.chatStore
      .visibleMessages()
      .find((message) => message.id === messageId);
    if (!assistantMessage || assistantMessage.role !== 'assistant') return;

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

  /** Resolves the matching selector ID for the most recent assistant response. */
  getLastUsedModelId(messages: ChatMessageDetailDto[]): string | null {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !!message.modelId);

    if (!lastAssistantMessage?.modelId) return null;

    const savedModelId = lastAssistantMessage.modelId;
    const savedProvider = lastAssistantMessage.provider;
    const matchingModel = this.aiStore.models().find((model) => {
      if (model.source !== 'direct') {
        return savedProvider === 'openrouter' && model.id === savedModelId;
      }

      return (
        this.resolveDirectProvider(model) === savedProvider &&
        (model.id.split('/')[1] || model.id) === savedModelId
      );
    });

    return (
      matchingModel?.id ??
      this.getDirectModelSelectorId(savedProvider, savedModelId) ??
      savedModelId
    );
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async buildAiMessages(userMessage: ChatMessageDetailDto): Promise<AiChatMessage[]> {
    const threadMessages = this.chatStore.visibleMessages();
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
    const bookId = this.chatStore.bookId();
    const contextMessage = bookId
      ? await this.chatAiContext.buildContextMessage({
          userMessage,
          bookId,
          bookTitle: this.workspaceStore.bookId() === bookId
            ? this.workspaceStore.bookTitle()
            : undefined,
          hierarchy: this.workspaceBookStore.bookHierarchy(),
        })
      : null;

    return includedMessages.flatMap((message) => {
      const aiMessage = { role: message.role, content: message.content };
      return contextMessage && message.id === userMessage.id
        ? [contextMessage, aiMessage]
        : [aiMessage];
    });
  }

  private async generateThreadTitle(
    userMessage: ChatMessageDetailDto,
    bookId: string,
    provider: string,
    modelId: string | null,
  ): Promise<void> {
    try {
      const rawTitle = await this.aiStreamService.streamText({
        streamId: `title-${userMessage.id}`,
        bookId,
        systemPromptCategory: 'title',
        prompt: userMessage.content,
        provider,
        modelId: modelId ?? undefined,
        reasoningMode: false,
      });
      const title = this.normalizeThreadTitle(rawTitle);

      if (title) {
        await this.chatStore.updateThread(userMessage.threadId, { title });
      }
    } catch (error) {
      // Title generation is opportunistic and should not fail the response.
      console.warn('[ChatResponseService] Failed to generate chat thread title:', error);
    }
  }

  private shouldGenerateThreadTitle(
    thread: ChatThreadDetailDto | null,
    userMessage: ChatMessageDetailDto,
  ): thread is ChatThreadDetailDto {
    if (
      !thread ||
      thread.id !== userMessage.threadId ||
      thread.title.trim() !== DEFAULT_CHAT_THREAD_TITLE
    )
      return false;

    const userMessages = this.chatStore
      .visibleMessages()
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
      return { provider: 'openrouter', modelId: null };
    }

    const selectedModel = this.aiStore.models().find((model) => model.id === selectedModelId);
    if (!selectedModel) {
      return { provider: 'openrouter', modelId: selectedModelId };
    }

    if (selectedModel.source !== 'direct') {
      return { provider: 'openrouter', modelId: selectedModel.id };
    }

    return {
      provider: this.resolveDirectProvider(selectedModel),
      modelId: selectedModel.id.split('/')[1] || selectedModel.id,
    };
  }

  private resolveDirectProvider(model: AiModel): string {
    if (model.provider === 'google' || model.id.startsWith('gemini/')) {
      return 'gemini';
    }

    if (model.provider === 'openai' || model.id.startsWith('openai/')) {
      return 'openai';
    }

    return model.provider || 'openrouter';
  }

  private getDirectModelSelectorId(provider: string | null, modelId: string): string | null {
    if (provider === 'openai') return `openai/${modelId}`;
    if (provider === 'gemini' || provider === 'google') return `gemini/${modelId}`;
    return null;
  }

  private getReasoningSummary(reasoningSummary: string): string | null {
    return reasoningSummary.trim().length > 0 ? reasoningSummary : null;
  }

  private requestRender(): void {
    this.responseRenderVersion.update((version) => version + 1);
  }
}
