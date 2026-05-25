export interface TiptapJsonDoc {
  type: 'doc';
  content: Record<string, any>[];
}

export interface SceneDto {
  id: string;
  title: string;
  chapterId: string;
  position: number;
  prose: TiptapJsonDoc | null;
  summary: string | null;
  wordCount: number | null;
  pointOfViewOverride: 'first' | 'second' | 'third_limited' | 'third_omni' | null;
  povCharacterIdOverride: string | null;
}

export interface ChapterDto {
  id: string;
  title: string;
  actId: string;
  position: number;
  summary: string | null;
  scenes?: SceneDto[];
}

export interface ActDto {
  id: string;
  title: string;
  bookId: string;
  position: number;
  summary: string | null;
  chapters?: ChapterDto[];
}

export type ManuscriptMode = 'scene' | 'chapter' | 'act' | 'book';

export type ManuscriptModeDto<T extends ManuscriptMode> =
  T extends 'book' ? ActDto[] :
  T extends 'act' ? ActDto :
  T extends 'chapter' ? ChapterDto :
  T extends 'scene' ? SceneDto : never;

export type ManuscriptDataDto = ActDto[] | ActDto | ChapterDto | SceneDto;

// Payloads for the manuscript:create* IPC channels
export interface CreateActPayload     { bookId: string; }
export interface CreateChapterPayload { actId: string; }
export interface CreateScenePayload   { chapterId: string; }

// Payloads for the manuscript:delete* IPC channels
export interface DeleteActPayload     { id: string; }
export interface DeleteChapterPayload { id: string; }
export interface DeleteScenePayload   { id: string; }

// Payloads for the manuscript:update* IPC channels
export interface UpdateActPayload     { id: string; title?: string; summary?: string; }
export interface UpdateChapterPayload { id: string; title?: string; summary?: string; }
export interface UpdateScenePayload   { id: string; title?: string; summary?: string; prose?: TiptapJsonDoc; wordCount?: number; }

