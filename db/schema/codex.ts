import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  CodexEntryStatus,
  CodexEntryType,
  CodexTrackingSetting,
} from '../../shared/models/codex.model';
import type { SqliteTimestamp } from '../core/sqlite-values';

export interface CodexEntryTable {
  id: string;
  bookId: string;
  type: Generated<CodexEntryType>;
  name: string;
  alias: Generated<string | null>;
  description: Generated<string | null>;
  image: Generated<Buffer | null>;
  status: Generated<CodexEntryStatus>;
  trackingSetting: Generated<CodexTrackingSetting>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export interface CodexEntryNoteTable {
  id: string;
  codexEntryId: string;
  content: string;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export interface CodexEntryProgressionTable {
  id: string;
  codexEntryId: string;
  title: Generated<string>;
  description: Generated<string>;
  sceneId: Generated<string | null>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export type CodexEntryRow = Selectable<CodexEntryTable>;
export type NewCodexEntryRow = Insertable<CodexEntryTable>;
export type CodexEntryUpdate = Updateable<CodexEntryTable>;
export type CodexEntryNoteRow = Selectable<CodexEntryNoteTable>;
export type NewCodexEntryNoteRow = Insertable<CodexEntryNoteTable>;
export type CodexEntryNoteUpdate = Updateable<CodexEntryNoteTable>;
export type CodexEntryProgressionRow = Selectable<CodexEntryProgressionTable>;
export type NewCodexEntryProgressionRow = Insertable<CodexEntryProgressionTable>;
export type CodexEntryProgressionUpdate = Updateable<CodexEntryProgressionTable>;
