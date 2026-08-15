import { randomUUID } from 'crypto';
import { and, asc, desc, eq, max } from 'drizzle-orm';

import { db } from '../index';
import {
  books,
  chatBranchSelections,
  chatMessages,
  chatThreads,
} from '../schema';
import {
  ChatBranchSelectionDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  ChatMessageDetailDto,
  ChatMessageDto,
  ChatThreadDetailDto,
  ChatThreadDto,
  UpdateChatMessageDto,
  UpdateChatThreadDto,
} from '../../shared/models/chat.model';

type ChatThreadEntity = typeof chatThreads.$inferSelect;
type ChatThreadInsert = typeof chatThreads.$inferInsert;
type ChatThreadUpdate = Partial<Omit<ChatThreadInsert, 'id' | 'bookId' | 'createdAt'>>;
type ChatMessageEntity = typeof chatMessages.$inferSelect;
type ChatMessageInsert = typeof chatMessages.$inferInsert;
type ChatMessageUpdate = Partial<Omit<ChatMessageInsert, 'id' | 'threadId' | 'createdAt'>>;
type ChatBranchSelectionEntity = typeof chatBranchSelections.$inferSelect;

export type CreateChatThreadData = CreateChatThreadDto;
export type UpdateChatThreadData = UpdateChatThreadDto;
export type CreateChatMessageData = CreateChatMessageDto;
export type UpdateChatMessageData = UpdateChatMessageDto;

export class ChatRepository {
  // -----------------------------------------------------------------------
  // Mapping helpers
  // -----------------------------------------------------------------------

  private mapThreadToDto(thread: ChatThreadEntity): ChatThreadDto {
    return {
      id: thread.id,
      bookId: thread.bookId,
      title: thread.title,
      status: thread.status,
      createdAt: this.dateToIso(thread.createdAt),
      lastEditedAt: this.dateToIso(thread.lastEditedAt),
    };
  }

  private mapMessageToDto(message: ChatMessageEntity): ChatMessageDto {
    return {
      id: message.id,
      threadId: message.threadId,
      parentMessageId: message.parentMessageId,
      branchGroupId: message.branchGroupId,
      branchOrder: message.branchOrder,
      role: message.role,
      content: message.content,
      status: message.status,
      position: message.position,
      modelId: message.modelId,
      provider: message.provider,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      reasoningSummary: message.reasoningSummary,
      error: message.error,
      createdAt: this.dateToIso(message.createdAt),
      lastEditedAt: this.dateToIso(message.lastEditedAt),
    };
  }

  private mapBranchSelectionToDto(selection: ChatBranchSelectionEntity): ChatBranchSelectionDto {
    return {
      threadId: selection.threadId,
      branchGroupId: selection.branchGroupId,
      selectedMessageId: selection.selectedMessageId,
    };
  }

  private dateToIso(value: Date | null): string {
    return (value ?? new Date(0)).toISOString();
  }

  private createThreadInsert(data: CreateChatThreadData): ChatThreadInsert {
    return {
      bookId: data.bookId,
      title: data.title ?? 'New chat',
      status: data.status ?? 'active',
    };
  }

  private createThreadUpdate(data: UpdateChatThreadData): ChatThreadUpdate {
    const updatePayload: ChatThreadUpdate = {
      lastEditedAt: new Date(),
    };

    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.status !== undefined) updatePayload.status = data.status;

    return updatePayload;
  }

  private createMessageInsert(
    data: CreateChatMessageData,
    position: number,
    branchGroupId: string,
    branchOrder: number,
  ): ChatMessageInsert {
    return {
      threadId: data.threadId,
      parentMessageId: data.parentMessageId ?? null,
      branchGroupId,
      branchOrder,
      role: data.role,
      content: data.content ?? '',
      status: data.status ?? 'complete',
      position,
      modelId: data.modelId ?? null,
      provider: data.provider ?? null,
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      reasoningSummary: data.reasoningSummary ?? null,
      error: data.error ?? null,
    };
  }

  private createMessageUpdate(data: UpdateChatMessageData): ChatMessageUpdate {
    const updatePayload: ChatMessageUpdate = {
      lastEditedAt: new Date(),
    };

    if (data.role !== undefined) updatePayload.role = data.role;
    if (data.parentMessageId !== undefined) updatePayload.parentMessageId = data.parentMessageId;
    if (data.branchGroupId !== undefined && data.branchGroupId !== null) {
      updatePayload.branchGroupId = data.branchGroupId;
    }
    if (data.branchOrder !== undefined && data.branchOrder !== null) {
      updatePayload.branchOrder = data.branchOrder;
    }
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.position !== undefined) updatePayload.position = data.position;
    if (data.modelId !== undefined) updatePayload.modelId = data.modelId;
    if (data.provider !== undefined) updatePayload.provider = data.provider;
    if (data.inputTokens !== undefined) updatePayload.inputTokens = data.inputTokens;
    if (data.outputTokens !== undefined) updatePayload.outputTokens = data.outputTokens;
    if (data.reasoningSummary !== undefined)
      updatePayload.reasoningSummary = data.reasoningSummary;
    if (data.error !== undefined) updatePayload.error = data.error;
    return updatePayload;
  }

  // -----------------------------------------------------------------------
  // Thread queries
  // -----------------------------------------------------------------------

  async getThreads(bookId: string, includeArchived = false): Promise<ChatThreadDto[]> {
    const clauses = [eq(chatThreads.bookId, bookId)];

    if (!includeArchived) {
      clauses.push(eq(chatThreads.status, 'active'));
    }

    const results = await db
      .select()
      .from(chatThreads)
      .where(and(...clauses))
      .orderBy(desc(chatThreads.lastEditedAt), desc(chatThreads.createdAt));

    return results.map((thread) => this.mapThreadToDto(thread));
  }

  async getThread(id: string): Promise<ChatThreadDetailDto | undefined> {
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, id),
    });

    if (!thread) {
      return undefined;
    }

    return {
      ...this.mapThreadToDto(thread),
      messages: await this.getMessages(id),
      branchSelections: await this.getBranchSelections(id),
    };
  }

  async getMessages(threadId: string): Promise<ChatMessageDetailDto[]> {
    const messages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: [asc(chatMessages.position), asc(chatMessages.branchOrder), asc(chatMessages.createdAt)],
    });

    return messages.map((message) => this.mapMessageToDto(message));
  }

  async getBranchSelections(threadId: string): Promise<ChatBranchSelectionDto[]> {
    const selections = await db.query.chatBranchSelections.findMany({
      where: eq(chatBranchSelections.threadId, threadId),
    });

    return selections.map((selection) => this.mapBranchSelectionToDto(selection));
  }

  // -----------------------------------------------------------------------
  // Thread mutations
  // -----------------------------------------------------------------------

  async createThread(data: CreateChatThreadData): Promise<ChatThreadDto> {
    const [created] = await db.insert(chatThreads).values(this.createThreadInsert(data)).returning();

    await this.touchBookLastEdited(created.bookId);
    return this.mapThreadToDto(created);
  }

  async updateThread(
    id: string,
    data: UpdateChatThreadData,
  ): Promise<ChatThreadDto | undefined> {
    const [updated] = await db
      .update(chatThreads)
      .set(this.createThreadUpdate(data))
      .where(eq(chatThreads.id, id))
      .returning();

    if (updated) {
      await this.touchBookLastEdited(updated.bookId);
    }

    return updated ? this.mapThreadToDto(updated) : undefined;
  }

  async archiveThread(id: string): Promise<ChatThreadDto | undefined> {
    return this.updateThread(id, { status: 'archived' });
  }

  async deleteThread(id: string): Promise<{ success: boolean }> {
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, id),
      columns: { bookId: true },
    });

    await db.delete(chatThreads).where(eq(chatThreads.id, id));

    if (thread) {
      await this.touchBookLastEdited(thread.bookId);
    }

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Message mutations
  // -----------------------------------------------------------------------

  async createMessage(data: CreateChatMessageData): Promise<ChatMessageDetailDto> {
    await this.ensureThreadExists(data.threadId);

    const position = data.position ?? (await this.getNextMessagePosition(data.threadId));
    const branchGroupId = data.branchGroupId ?? randomUUID();
    const branchOrder = data.branchOrder ?? (await this.getNextBranchOrder(data.threadId, branchGroupId));
    const [created] = await db
      .insert(chatMessages)
      .values(this.createMessageInsert(data, position, branchGroupId, branchOrder))
      .returning();

    await this.ensureDefaultBranchSelection(created.threadId, created.branchGroupId, created.id);
    await this.touchThreadLastEdited(created.threadId);

    const detail = await this.getMessage(created.id);

    if (!detail) {
      throw new Error('Failed to retrieve new chat message');
    }

    return detail;
  }

  async selectBranch(
    threadId: string,
    branchGroupId: string,
    selectedMessageId: string,
  ): Promise<ChatBranchSelectionDto> {
    const selectedMessage = await db.query.chatMessages.findFirst({
      where: and(
        eq(chatMessages.id, selectedMessageId),
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.branchGroupId, branchGroupId),
      ),
      columns: { id: true },
    });

    if (!selectedMessage) {
      throw new Error('Selected branch message was not found.');
    }

    const [selection] = await db
      .insert(chatBranchSelections)
      .values({ threadId, branchGroupId, selectedMessageId })
      .onConflictDoUpdate({
        target: [chatBranchSelections.threadId, chatBranchSelections.branchGroupId],
        set: { selectedMessageId },
      })
      .returning();

    await this.touchThreadLastEdited(threadId);
    return this.mapBranchSelectionToDto(selection);
  }

  async updateMessage(
    id: string,
    data: UpdateChatMessageData,
  ): Promise<ChatMessageDetailDto | undefined> {
    const [updated] = await db
      .update(chatMessages)
      .set(this.createMessageUpdate(data))
      .where(eq(chatMessages.id, id))
      .returning();

    if (!updated) {
      return undefined;
    }

    await this.touchThreadLastEdited(updated.threadId);

    return this.getMessage(updated.id);
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    const message = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, id),
      columns: {
        threadId: true,
      },
    });

    await db.delete(chatMessages).where(eq(chatMessages.id, id));

    if (message) {
      await this.touchThreadLastEdited(message.threadId);
    }

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async getMessage(id: string): Promise<ChatMessageDetailDto | undefined> {
    const message = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, id),
    });

    return message ? this.mapMessageToDto(message) : undefined;
  }

  private async ensureThreadExists(threadId: string): Promise<void> {
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
      columns: { id: true },
    });

    if (!thread) {
      throw new Error('Chat thread not found');
    }
  }

  private async getNextMessagePosition(threadId: string): Promise<number> {
    const [maxRow] = await db
      .select({ maxPos: max(chatMessages.position) })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId));

    return (maxRow?.maxPos ?? -1) + 1;
  }

  private async getNextBranchOrder(threadId: string, branchGroupId: string): Promise<number> {
    const [maxRow] = await db
      .select({ maxOrder: max(chatMessages.branchOrder) })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.branchGroupId, branchGroupId),
      ));

    return (maxRow?.maxOrder ?? -1) + 1;
  }

  private async ensureDefaultBranchSelection(
    threadId: string,
    branchGroupId: string,
    selectedMessageId: string,
  ): Promise<void> {
    await db
      .insert(chatBranchSelections)
      .values({ threadId, branchGroupId, selectedMessageId })
      .onConflictDoNothing();
  }

  private async touchThreadLastEdited(threadId: string): Promise<void> {
    const [updated] = await db
      .update(chatThreads)
      .set({ lastEditedAt: new Date() })
      .where(eq(chatThreads.id, threadId))
      .returning({ bookId: chatThreads.bookId });

    if (updated) {
      await this.touchBookLastEdited(updated.bookId);
    }
  }

  private async touchBookLastEdited(bookId: string): Promise<void> {
    await db.update(books).set({ lastEditedAt: new Date() }).where(eq(books.id, bookId));
  }
}

export const chatRepository = new ChatRepository();
