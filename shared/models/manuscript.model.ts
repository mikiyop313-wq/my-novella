export interface SceneDto {
  id: string;
  title: string;
  chapterId: string;
  position: number;
  prose: string | null;
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
  prose: string | null;
  summary: string | null;
  scenes?: SceneDto[];
}

export interface ActDto {
  id: string;
  title: string;
  bookId: string;
  position: number;
  prose: string | null;
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
