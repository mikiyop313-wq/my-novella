export const ACT_HEADER_NODE_TYPE = 'actHeader';
export const CHAPTER_HEADER_NODE_TYPE = 'chapterHeader';
export const SCENE_HEADER_NODE_TYPE = 'sceneSummary';
export const SCENE_SKELETON_NODE_TYPE = 'sceneSkeleton';

export type ManuscriptHeaderNodeType =
  | typeof ACT_HEADER_NODE_TYPE
  | typeof CHAPTER_HEADER_NODE_TYPE
  | typeof SCENE_HEADER_NODE_TYPE;

export const HEADER_NODE_TYPES = new Set<string>([
  ACT_HEADER_NODE_TYPE,
  CHAPTER_HEADER_NODE_TYPE,
  SCENE_HEADER_NODE_TYPE,
]);

export function isHeaderNodeType(type: string | undefined): type is ManuscriptHeaderNodeType {
  return !!type && HEADER_NODE_TYPES.has(type);
}

export function isSceneHeaderNodeType(type: string | undefined): type is typeof SCENE_HEADER_NODE_TYPE {
  return type === SCENE_HEADER_NODE_TYPE;
}
