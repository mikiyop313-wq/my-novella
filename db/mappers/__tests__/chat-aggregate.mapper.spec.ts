import { describe, expect, it } from 'vitest';

import type { ChatMessageRow, ChatThreadRow } from '../../schema';
import {
  mapChatMessageRow,
  mapChatThreadAggregate,
  mapChatThreadRow,
} from '../chat-aggregate.mapper';

describe('chat aggregate mapper', () => {
  it('maps timestamps and defaults null timestamps to the Unix epoch', () => {
    expect(mapChatThreadRow(threadRow({ createdAt: null })).createdAt)
      .toBe('1970-01-01T00:00:00.000Z');
    expect(mapChatMessageRow(messageRow({ lastEditedAt: 2 })).lastEditedAt)
      .toBe('1970-01-01T00:00:02.000Z');
  });

  it('assembles messages and branch selections in supplied order', () => {
    const detail = mapChatThreadAggregate({
      thread: threadRow(),
      messages: [messageRow({ id: 'message-2' }), messageRow({ id: 'message-1' })],
      branchSelections: [
        { threadId: 'thread-1', branchGroupId: 'branch-2', selectedMessageId: 'message-2' },
        { threadId: 'thread-1', branchGroupId: 'branch-1', selectedMessageId: 'message-1' },
      ],
    });

    expect(detail.messages.map(({ id }) => id)).toEqual(['message-2', 'message-1']);
    expect(detail.branchSelections.map(({ branchGroupId }) => branchGroupId))
      .toEqual(['branch-2', 'branch-1']);
  });
});

function threadRow(overrides: Partial<ChatThreadRow> = {}): ChatThreadRow {
  return {
    id: 'thread-1',
    bookId: 'book-1',
    title: 'Thread',
    status: 'active',
    lastModelId: null,
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}

function messageRow(overrides: Partial<ChatMessageRow> = {}): ChatMessageRow {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    parentMessageId: null,
    branchGroupId: 'branch-1',
    branchOrder: 0,
    role: 'user',
    content: 'Message',
    status: 'complete',
    position: 0,
    modelId: null,
    provider: null,
    inputTokens: null,
    outputTokens: null,
    reasoningSummary: null,
    error: null,
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}
