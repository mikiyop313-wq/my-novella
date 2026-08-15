import {
  type CodexEntryType,
  type CodexTrackingSetting,
} from './codex.model';

export type CodexEntryMenuView = 'Description' | 'Progression' | 'Notes' | 'Tracking';

export type CodexEntryNoteInput = {
  id: string | null;
  title: string;
  content: string;
};

export type CodexEntryProgressionPayload = {
  id: string | null;
  title: string;
  description: string;
  sceneId: string | null;
};

export type CodexEntryMenuPayload = {
  type: CodexEntryType;
  name: string;
  alias: string;
  description: string;
  trackingSetting: CodexTrackingSetting;
  notes: CodexEntryNoteInput[];
  progression: CodexEntryProgressionPayload[];
};

export type CodexDetachRequest = {
  entryId: string | null;
  initialType: CodexEntryType;
  draft: CodexEntryMenuPayload;
  activeView: CodexEntryMenuView;
  isArchived: boolean;
};

export type CodexDetachedWindowOpenRequest = CodexDetachRequest & {
  bookId: string | null;
};

export type CodexDetachedWindowSession = CodexDetachedWindowOpenRequest & {
  sessionId: string;
};

export type CodexDetachedEntryChangedEvent = {
  bookId: string | null;
  entryId: string | null;
  type: CodexEntryType;
};
