export type ChatDetachedWindowOpenRequest = {
  bookId: string;
  selectedThreadId: string | null;
};

export type ChatDetachedWindowSession = ChatDetachedWindowOpenRequest & {
  sessionId: string;
};

export type ChatDetachedWindowClosedEvent = {
  bookId: string;
  sessionId: string;
};
