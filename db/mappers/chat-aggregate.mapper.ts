import type {
  ChatMessageDto,
  ChatThreadDetailDto,
  ChatThreadDto,
} from '../../shared/models/chat.model';
import { fromSqliteTimestamp } from '../core/sqlite-values';
import type {
  ChatBranchSelectionRow,
  ChatMessageRow,
  ChatThreadRow,
} from '../schema';

export interface ChatThreadAggregateRows {
  thread: ChatThreadRow;
  messages: ChatMessageRow[];
  branchSelections: ChatBranchSelectionRow[];
}

export function mapChatThreadRow(thread: ChatThreadRow): ChatThreadDto {
  return {
    id: thread.id,
    bookId: thread.bookId,
    title: thread.title,
    status: thread.status,
    lastModelId: thread.lastModelId,
    createdAt: dateToIso(thread.createdAt),
    lastEditedAt: dateToIso(thread.lastEditedAt),
  };
}

export function mapChatMessageRow(message: ChatMessageRow): ChatMessageDto {
  return {
    ...message,
    createdAt: dateToIso(message.createdAt),
    lastEditedAt: dateToIso(message.lastEditedAt),
  };
}

export function mapChatThreadAggregate({
  thread,
  messages,
  branchSelections,
}: ChatThreadAggregateRows): ChatThreadDetailDto {
  return {
    ...mapChatThreadRow(thread),
    messages: messages.map(mapChatMessageRow),
    branchSelections,
  };
}

function dateToIso(value: number | null): string {
  return (fromSqliteTimestamp(value) ?? new Date(0)).toISOString();
}
