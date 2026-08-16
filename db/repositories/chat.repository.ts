import { randomUUID } from 'crypto';
import { sql } from 'kysely';

import type {
  ChatBranchSelectionDto,
  ChatMessageDetailDto,
  ChatThreadDetailDto,
  ChatThreadDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  UpdateChatMessageDto,
  UpdateChatThreadDto,
} from '../../shared/models/chat.model';
import { db } from '../index';
import type {
  ChatMessageUpdate,
  ChatThreadUpdate,
  NewChatMessageRow,
  NewChatThreadRow,
} from '../schema';
import { toSqliteTimestamp } from '../core/sqlite-values';
import {
  mapChatMessageRow,
  mapChatThreadAggregate,
  mapChatThreadRow,
} from '../mappers/chat-aggregate.mapper';

export type CreateChatThreadData = CreateChatThreadDto;
export type UpdateChatThreadData = UpdateChatThreadDto;
export type CreateChatMessageData = CreateChatMessageDto;
export type UpdateChatMessageData = UpdateChatMessageDto;

export class ChatRepository {
  private createThreadInsert(data: CreateChatThreadData): NewChatThreadRow {
    const timestamp = toSqliteTimestamp();
    return {
      id: randomUUID(),
      bookId: data.bookId,
      title: data.title ?? 'New chat',
      status: data.status ?? 'active',
      lastModelId: data.lastModelId ?? null,
      createdAt: timestamp,
      lastEditedAt: timestamp,
    };
  }

  private createThreadUpdate(data: UpdateChatThreadData): ChatThreadUpdate {
    const update: ChatThreadUpdate = { lastEditedAt: toSqliteTimestamp() };
    if (data.title !== undefined) update.title = data.title;
    if (data.status !== undefined) update.status = data.status;
    if (data.lastModelId !== undefined) update.lastModelId = data.lastModelId;
    return update;
  }

  private createMessageInsert({
    data,
    position,
    branchGroupId,
    branchOrder,
  }: {
    data: CreateChatMessageData;
    position: number;
    branchGroupId: string;
    branchOrder: number;
  }): NewChatMessageRow {
    const timestamp = toSqliteTimestamp();
    return {
      id: randomUUID(),
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
      createdAt: timestamp,
      lastEditedAt: timestamp,
    };
  }

  private createMessageUpdate(data: UpdateChatMessageData): ChatMessageUpdate {
    const update: ChatMessageUpdate = { lastEditedAt: toSqliteTimestamp() };
    if (data.role !== undefined) update.role = data.role;
    if (data.parentMessageId !== undefined) update.parentMessageId = data.parentMessageId;
    if (data.branchGroupId !== undefined && data.branchGroupId !== null) update.branchGroupId = data.branchGroupId;
    if (data.branchOrder !== undefined && data.branchOrder !== null) update.branchOrder = data.branchOrder;
    if (data.content !== undefined) update.content = data.content;
    if (data.status !== undefined) update.status = data.status;
    if (data.position !== undefined) update.position = data.position;
    if (data.modelId !== undefined) update.modelId = data.modelId;
    if (data.provider !== undefined) update.provider = data.provider;
    if (data.inputTokens !== undefined) update.inputTokens = data.inputTokens;
    if (data.outputTokens !== undefined) update.outputTokens = data.outputTokens;
    if (data.reasoningSummary !== undefined) update.reasoningSummary = data.reasoningSummary;
    if (data.error !== undefined) update.error = data.error;
    return update;
  }

  async getThreads(bookId: string, includeArchived = false): Promise<ChatThreadDto[]> {
    let query = db.selectFrom('chatThreads').selectAll().where('bookId', '=', bookId);
    if (!includeArchived) {
      query = query.where('status', '=', 'active');
    }
    const rows = await query.orderBy('lastEditedAt', 'desc').orderBy('createdAt', 'desc').execute();
    return rows.map(mapChatThreadRow);
  }

  async getThread(id: string): Promise<ChatThreadDetailDto | undefined> {
    const thread = await db.selectFrom('chatThreads').selectAll().where('id', '=', id).executeTakeFirst();
    if (!thread) return undefined;
    const [messages, branchSelections] = await Promise.all([
      db
        .selectFrom('chatMessages')
        .selectAll()
        .where('threadId', '=', id)
        .orderBy('position')
        .orderBy('branchOrder')
        .orderBy('createdAt')
        .execute(),
      db.selectFrom('chatBranchSelections').selectAll().where('threadId', '=', id).execute(),
    ]);
    return mapChatThreadAggregate({ thread, messages, branchSelections });
  }

  async getMessages(threadId: string): Promise<ChatMessageDetailDto[]> {
    const rows = await db
      .selectFrom('chatMessages')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('position')
      .orderBy('branchOrder')
      .orderBy('createdAt')
      .execute();
    return rows.map(mapChatMessageRow);
  }

  async getBranchSelections(threadId: string): Promise<ChatBranchSelectionDto[]> {
    return db.selectFrom('chatBranchSelections').selectAll().where('threadId', '=', threadId).execute();
  }

  async createThread(data: CreateChatThreadData): Promise<ChatThreadDto> {
    const created = await db.insertInto('chatThreads').values(this.createThreadInsert(data)).returningAll().executeTakeFirstOrThrow();
    await this.touchBookLastEdited(created.bookId);
    return mapChatThreadRow(created);
  }

  async updateThread(id: string, data: UpdateChatThreadData): Promise<ChatThreadDto | undefined> {
    const updated = await db.updateTable('chatThreads').set(this.createThreadUpdate(data)).where('id', '=', id).returningAll().executeTakeFirst();
    if (updated) await this.touchBookLastEdited(updated.bookId);
    return updated ? mapChatThreadRow(updated) : undefined;
  }

  async archiveThread(id: string): Promise<ChatThreadDto | undefined> {
    return this.updateThread(id, { status: 'archived' });
  }

  async deleteThread(id: string): Promise<{ success: boolean }> {
    const thread = await db.selectFrom('chatThreads').select('bookId').where('id', '=', id).executeTakeFirst();
    await db.deleteFrom('chatThreads').where('id', '=', id).execute();
    if (thread) await this.touchBookLastEdited(thread.bookId);
    return { success: true };
  }

  async createMessage(data: CreateChatMessageData): Promise<ChatMessageDetailDto> {
    await this.ensureThreadExists(data.threadId);
    const position = data.position ?? (await this.getNextMessagePosition(data.threadId));
    const branchGroupId = data.branchGroupId ?? randomUUID();
    const branchOrder = data.branchOrder ?? (await this.getNextBranchOrder(data.threadId, branchGroupId));
    const created = await db
      .insertInto('chatMessages')
      .values(this.createMessageInsert({ data, position, branchGroupId, branchOrder }))
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.ensureDefaultBranchSelection(created.threadId, created.branchGroupId, created.id);
    await this.touchThreadLastEdited(created.threadId);
    const detail = await this.getMessage(created.id);
    if (!detail) throw new Error('Failed to retrieve new chat message');
    return detail;
  }

  async selectBranch(threadId: string, branchGroupId: string, selectedMessageId: string): Promise<ChatBranchSelectionDto> {
    const selectedMessage = await db
      .selectFrom('chatMessages')
      .select('id')
      .where('id', '=', selectedMessageId)
      .where('threadId', '=', threadId)
      .where('branchGroupId', '=', branchGroupId)
      .executeTakeFirst();
    if (!selectedMessage) throw new Error('Selected branch message was not found.');
    const selection = await db
      .insertInto('chatBranchSelections')
      .values({ threadId, branchGroupId, selectedMessageId })
      .onConflict((conflict) => conflict.columns(['threadId', 'branchGroupId']).doUpdateSet({ selectedMessageId }))
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.touchThreadLastEdited(threadId);
    return selection;
  }

  async updateMessage(id: string, data: UpdateChatMessageData): Promise<ChatMessageDetailDto | undefined> {
    const updated = await db.updateTable('chatMessages').set(this.createMessageUpdate(data)).where('id', '=', id).returningAll().executeTakeFirst();
    if (!updated) return undefined;
    await this.touchThreadLastEdited(updated.threadId);
    return this.getMessage(updated.id);
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    const message = await db.selectFrom('chatMessages').select('threadId').where('id', '=', id).executeTakeFirst();
    await db.deleteFrom('chatMessages').where('id', '=', id).execute();
    if (message) await this.touchThreadLastEdited(message.threadId);
    return { success: true };
  }

  private async getMessage(id: string): Promise<ChatMessageDetailDto | undefined> {
    const message = await db.selectFrom('chatMessages').selectAll().where('id', '=', id).executeTakeFirst();
    return message ? mapChatMessageRow(message) : undefined;
  }

  private async ensureThreadExists(threadId: string): Promise<void> {
    const thread = await db.selectFrom('chatThreads').select('id').where('id', '=', threadId).executeTakeFirst();
    if (!thread) throw new Error('Chat thread not found');
  }

  private async getNextMessagePosition(threadId: string): Promise<number> {
    const row = await db.selectFrom('chatMessages').select(sql<number | null>`max(position)`.as('maxPos')).where('threadId', '=', threadId).executeTakeFirst();
    return (row?.maxPos ?? -1) + 1;
  }

  private async getNextBranchOrder(threadId: string, branchGroupId: string): Promise<number> {
    const row = await db.selectFrom('chatMessages').select(sql<number | null>`max(branch_order)`.as('maxOrder')).where('threadId', '=', threadId).where('branchGroupId', '=', branchGroupId).executeTakeFirst();
    return (row?.maxOrder ?? -1) + 1;
  }

  private async ensureDefaultBranchSelection(threadId: string, branchGroupId: string, selectedMessageId: string): Promise<void> {
    await db.insertInto('chatBranchSelections').values({ threadId, branchGroupId, selectedMessageId }).onConflict((conflict) => conflict.doNothing()).execute();
  }

  private async touchThreadLastEdited(threadId: string): Promise<void> {
    const updated = await db.updateTable('chatThreads').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', threadId).returning('bookId').executeTakeFirst();
    if (updated) await this.touchBookLastEdited(updated.bookId);
  }

  private async touchBookLastEdited(bookId: string): Promise<void> {
    await db.updateTable('books').set({ lastEditedAt: toSqliteTimestamp() }).where('id', '=', bookId).execute();
  }
}

export const chatRepository = new ChatRepository();
