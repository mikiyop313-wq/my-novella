import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { BookSettingsDto } from '../../shared/models/book.model';
import type { ManuscriptEntityStatus } from '../../shared/models/manuscript.model';
import type { SqliteBoolean } from '../core/sqlite-values';

export interface ActTable {
  id: string;
  title: string;
  bookId: string;
  position: number;
  status: Generated<ManuscriptEntityStatus>;
  summary: Generated<string | null>;
}

export interface ChapterTable {
  id: string;
  title: string;
  bookId: string;
  actId: Generated<string | null>;
  position: number;
  status: Generated<ManuscriptEntityStatus>;
  archiveParentTitle: Generated<string | null>;
  summary: Generated<string | null>;
}

export interface SceneTable {
  id: string;
  title: string;
  bookId: string;
  chapterId: Generated<string | null>;
  position: number;
  status: Generated<ManuscriptEntityStatus>;
  archiveParentTitle: Generated<string | null>;
  prose: Generated<string | null>;
  summary: Generated<string | null>;
  wordCount: Generated<number | null>;
  includeInContext: Generated<SqliteBoolean>;
  pointOfViewOverride: Generated<BookSettingsDto['pointOfView'] | null>;
  povCharacterIdOverride: Generated<string | null>;
}

export type ActRow = Selectable<ActTable>;
export type NewActRow = Insertable<ActTable>;
export type ActUpdate = Updateable<ActTable>;
export type ChapterRow = Selectable<ChapterTable>;
export type NewChapterRow = Insertable<ChapterTable>;
export type ChapterUpdate = Updateable<ChapterTable>;
export type SceneRow = Selectable<SceneTable>;
export type NewSceneRow = Insertable<SceneTable>;
export type SceneUpdate = Updateable<SceneTable>;
