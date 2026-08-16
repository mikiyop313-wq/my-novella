import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  ChatMessageRole,
  ChatMessageStatus,
  ChatThreadStatus,
} from '../../shared/models/chat.model';
import type { SqliteTimestamp } from '../core/sqlite-values';

export interface ChatThreadTable {
  id: string;
  bookId: string;
  title: Generated<string>;
  status: Generated<ChatThreadStatus>;
  lastModelId: Generated<string | null>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export interface ChatMessageTable {
  id: string;
  threadId: string;
  parentMessageId: Generated<string | null>;
  branchGroupId: string;
  branchOrder: Generated<number>;
  role: ChatMessageRole;
  content: Generated<string>;
  status: Generated<ChatMessageStatus>;
  position: number;
  modelId: Generated<string | null>;
  provider: Generated<string | null>;
  inputTokens: Generated<number | null>;
  outputTokens: Generated<number | null>;
  reasoningSummary: Generated<string | null>;
  error: Generated<string | null>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export interface ChatBranchSelectionTable {
  threadId: string;
  branchGroupId: string;
  selectedMessageId: string;
}

export type ChatThreadRow = Selectable<ChatThreadTable>;
export type NewChatThreadRow = Insertable<ChatThreadTable>;
export type ChatThreadUpdate = Updateable<ChatThreadTable>;
export type ChatMessageRow = Selectable<ChatMessageTable>;
export type NewChatMessageRow = Insertable<ChatMessageTable>;
export type ChatMessageUpdate = Updateable<ChatMessageTable>;
export type ChatBranchSelectionRow = Selectable<ChatBranchSelectionTable>;
export type NewChatBranchSelectionRow = Insertable<ChatBranchSelectionTable>;
