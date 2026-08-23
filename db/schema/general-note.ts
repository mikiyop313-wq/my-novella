import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { SqliteTimestamp } from '../core/sqlite-values';

export interface GeneralNoteTable {
  id: string;
  bookId: string;
  title: Generated<string>;
  content: Generated<string>;
  createdAt: Generated<SqliteTimestamp | null>;
  lastEditedAt: Generated<SqliteTimestamp | null>;
}

export type GeneralNoteRow = Selectable<GeneralNoteTable>;
export type NewGeneralNoteRow = Insertable<GeneralNoteTable>;
export type GeneralNoteUpdate = Updateable<GeneralNoteTable>;
