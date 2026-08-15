/** A mark applied to inline content (bold, italic, link, etc.). */
export interface TiptapMark {
  /** The mark type name (e.g. 'bold', 'link'). */
  type: string;
  /** Optional mark-specific attributes (e.g. href for links). */
  attrs?: Record<string, string | number | boolean | null>;
}

/** A single node inside a Tiptap/ProseMirror JSON document (paragraph, heading, custom block, etc.). */
export interface TiptapNode {
  /** The node type name (e.g. 'paragraph', 'heading', 'text'). */
  type: string;
  /** Optional node-specific attributes (e.g. level for headings). */
  attrs?: Record<string, string | number | boolean | null>;
  /** Child nodes; present on block/inline container nodes. */
  content?: TiptapNode[];
  /** Inline marks applied to this node. */
  marks?: TiptapMark[];
  /** Raw text content; only present on text nodes. */
  text?: string;
}

export interface TiptapJsonDoc {
  type: 'doc';
  content: TiptapNode[];
}

export type ManuscriptEntityStatus = 'active' | 'archived';

export interface SceneDto {
  id: string;
  title: string;
  chapterId: string;
  position: number;
  status: ManuscriptEntityStatus;
  prose: TiptapJsonDoc | null;
  summary: string | null;
  wordCount: number | null;
  pointOfViewOverride: 'first' | 'second' | 'third_limited' | 'third_omni' | null;
  povCharacterIdOverride: string | null;
  /** Saved user preference. Empty scenes remain effectively excluded while this is true. */
  includeInContext?: boolean;
  /** Backend-derived state after applying content eligibility and ancestor rules. */
  isIncludedInContext?: boolean;
}

export interface ChapterDto {
  id: string;
  title: string;
  actId: string;
  position: number;
  status: ManuscriptEntityStatus;
  summary: string | null;
  scenes?: SceneDto[];
  /** True when at least one child scene is effectively included. */
  isIncludedInContext?: boolean;
}

export interface ActDto {
  id: string;
  title: string;
  bookId: string;
  position: number;
  status: ManuscriptEntityStatus;
  summary: string | null;
  chapters?: ChapterDto[];
  /** True when at least one child chapter is effectively included. */
  isIncludedInContext?: boolean;
}

export type ManuscriptContextEntityType = 'act' | 'chapter' | 'scene';

export interface SetContextInclusionPayload {
  entityType: ManuscriptContextEntityType;
  id: string;
  included: boolean;
}

/** Lightweight scene data used by the archive manager. */
export interface ArchiveSceneDto {
  id: string;
  title: string;
  chapterId: string | null;
  archiveParentTitle: string | null;
  position: number;
  status: ManuscriptEntityStatus;
}

/** Lightweight chapter data used by the archive manager. */
export interface ArchiveChapterDto {
  id: string;
  title: string;
  actId: string | null;
  archiveParentTitle: string | null;
  position: number;
  status: ManuscriptEntityStatus;
  scenes: ArchiveSceneDto[];
}

/** Lightweight act data used by the archive manager. */
export interface ArchiveActDto {
  id: string;
  title: string;
  bookId: string;
  position: number;
  status: ManuscriptEntityStatus;
  chapters: ArchiveChapterDto[];
}

export interface ArchiveOverviewDto {
  archivedActs: ArchiveActDto[];
  archivedChapters: ArchiveChapterDto[];
  archivedScenes: ArchiveSceneDto[];
}

export type ManuscriptMode = 'scene' | 'chapter' | 'act' | 'book';

export type ManuscriptModeDto<T extends ManuscriptMode> =
  T extends 'book'    ? ActDto[]    :
  T extends 'act'     ? ActDto      :
  T extends 'chapter' ? ChapterDto  :
  T extends 'scene'   ? SceneDto    : never;

export type ManuscriptDataDto = ActDto[] | ActDto | ChapterDto | SceneDto;

// Payloads for the manuscript:create* IPC channels
export interface CreateActPayload     { bookId: string; }
export interface CreateChapterPayload { actId: string; }
export interface CreateScenePayload   { chapterId: string; }

// Payloads for the manuscript:delete* IPC channels
export interface DeleteActPayload     { id: string; }
export interface DeleteChapterPayload { id: string; }
export interface DeleteScenePayload   { id: string; }

// Payloads for the manuscript:archive* IPC channels
export interface ArchiveActPayload     { id: string; }
export interface ArchiveChapterPayload { id: string; }
export interface ArchiveScenePayload   { id: string; }

// Payloads for archive management IPC channels
export interface GetArchiveOverviewPayload { bookId: string; }
export interface RestoreActPayload          { id: string; }
export interface RestoreChapterPayload      { id: string; targetActId: string; }
export interface RestoreScenePayload        { id: string; targetChapterId: string; }

// Payloads for manuscript structure position updates.
export interface ActPositionUpdate     { id: string; bookId: string; position: number; }
export interface ChapterPositionUpdate { id: string; actId: string; position: number; }
export interface ScenePositionUpdate   { id: string; chapterId: string; position: number; }

export interface UpdateStructurePositionsPayload {
  acts?: ActPositionUpdate[];
  chapters?: ChapterPositionUpdate[];
  scenes?: ScenePositionUpdate[];
}

// Payloads for the manuscript:update* IPC channels
export interface UpdateActPayload     { id: string; title?: string; summary?: string; }
export interface UpdateChapterPayload { id: string; title?: string; summary?: string; }
export interface UpdateScenePayload   { id: string; title?: string; summary?: string; prose?: TiptapJsonDoc; wordCount?: number; }

