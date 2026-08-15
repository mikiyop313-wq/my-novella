export type ChatThreadStatus = 'active' | 'archived';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatMessageStatus = 'pending' | 'streaming' | 'complete' | 'failed' | 'aborted';

export interface ChatThreadDto {
  id: string;
  bookId: string;
  title: string;
  status: ChatThreadStatus;
  createdAt: string;
  lastEditedAt: string;
}

export interface ChatMessageDto {
  id: string;
  threadId: string;
  parentMessageId: string | null;
  branchGroupId: string | null;
  branchOrder: number | null;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  position: number;
  modelId: string | null;
  provider: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningSummary: string | null;
  error: string | null;
  createdAt: string;
  lastEditedAt: string;
}

export interface ChatBranchSelectionDto {
  threadId: string;
  branchGroupId: string;
  selectedMessageId: string;
}

export type ChatMessageDetailDto = ChatMessageDto;

export interface ChatThreadDetailDto extends ChatThreadDto {
  messages: ChatMessageDetailDto[];
  branchSelections: ChatBranchSelectionDto[];
}

export interface CreateChatThreadDto {
  bookId: string;
  title?: string;
  status?: ChatThreadStatus;
}

export type UpdateChatThreadDto = Partial<Omit<CreateChatThreadDto, 'bookId'>>;

export interface CreateChatMessageDto {
  threadId: string;
  parentMessageId?: string | null;
  branchGroupId?: string | null;
  branchOrder?: number | null;
  role: ChatMessageRole;
  content?: string;
  status?: ChatMessageStatus;
  position?: number;
  modelId?: string | null;
  provider?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningSummary?: string | null;
  error?: string | null;
}

export type UpdateChatMessageDto = Partial<Omit<CreateChatMessageDto, 'threadId'>>;

export interface GetChatThreadsPayload {
  bookId: string;
  includeArchived?: boolean;
}

export interface GetChatThreadPayload {
  id: string;
}

export interface CreateChatThreadPayload {
  data: CreateChatThreadDto;
}

export interface UpdateChatThreadPayload {
  id: string;
  data: UpdateChatThreadDto;
}

export interface DeleteChatThreadPayload {
  id: string;
}

export interface CreateChatMessagePayload {
  data: CreateChatMessageDto;
}

export interface UpdateChatMessagePayload {
  id: string;
  data: UpdateChatMessageDto;
}

export interface DeleteChatMessagePayload {
  id: string;
}

export interface SelectChatBranchPayload {
  threadId: string;
  branchGroupId: string;
  selectedMessageId: string;
}
