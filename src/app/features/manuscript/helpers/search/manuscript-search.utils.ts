import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type {
  ActDto,
  ChapterDto,
  ManuscriptDataDto,
  SceneDto,
  TiptapNode,
} from '../../../../../../shared/models/manuscript.model';
import {
  findTextMatches,
  type TextSearchOptions,
} from '../../../../shared/utils/text-search.utils';
import { isHeaderNodeType } from '../content/manuscript-node-types';

const SEARCHABLE_TEXT_BLOCK_TYPES = new Set(['paragraph', 'heading', 'codeBlock']);
const EXCLUDED_PROSE_NODE_TYPES = new Set(['aiPrompt', 'aiGeneratedBlock', 'sceneSkeleton']);
export type ManuscriptSearchOptions = TextSearchOptions;

export interface ManuscriptSearchMatch {
  sceneId: string;
  blockIndex: number;
  fromOffset: number;
  toOffset: number;
  from?: number;
  to?: number;
}

export interface EditorSearchResult {
  matches: ManuscriptSearchMatch[];
  materializedSceneIds: string[];
}

export function getManuscriptScenes(data: ManuscriptDataDto): SceneDto[] {
  if (Array.isArray(data)) return data.flatMap(act => getActScenes(act));
  if (isSceneDto(data)) return [data];
  if (isChapterDto(data)) return data.scenes ?? [];
  return getActScenes(data);
}

export function searchManuscriptData(
  data: ManuscriptDataDto,
  options: ManuscriptSearchOptions,
): ManuscriptSearchMatch[] {
  if (!options.query) return [];

  return getManuscriptScenes(data).flatMap(scene => searchSceneJson(scene, options));
}

export function searchEditorProse(
  editor: Editor,
  options: ManuscriptSearchOptions,
): EditorSearchResult {
  const matches: ManuscriptSearchMatch[] = [];
  const materializedSceneIds: string[] = [];
  let currentSceneId: string | null = null;
  let currentSceneIsMaterialized = false;
  let blockIndex = 0;

  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'sceneSummary') {
      if (currentSceneId && currentSceneIsMaterialized) materializedSceneIds.push(currentSceneId);
      currentSceneId = typeof node.attrs['id'] === 'string' ? node.attrs['id'] : null;
      currentSceneIsMaterialized = true;
      blockIndex = 0;
      return;
    }

    if (isHeaderNodeType(node.type.name)) {
      if (currentSceneId && currentSceneIsMaterialized) materializedSceneIds.push(currentSceneId);
      currentSceneId = null;
      currentSceneIsMaterialized = false;
      blockIndex = 0;
      return;
    }

    if (!currentSceneId) return;
    if (node.type.name === 'sceneSkeleton') {
      currentSceneIsMaterialized = false;
      return;
    }
    if (EXCLUDED_PROSE_NODE_TYPES.has(node.type.name)) return;

    if (node.isTextblock) {
      matches.push(...searchProseMirrorTextBlock({
        node,
        nodePosition: offset,
        sceneId: currentSceneId,
        blockIndex,
        options,
      }));
      blockIndex++;
      return;
    }

    node.descendants((child, relativePosition) => {
      if (EXCLUDED_PROSE_NODE_TYPES.has(child.type.name)) return false;
      if (!child.isTextblock) return true;

      matches.push(...searchProseMirrorTextBlock({
        node: child,
        nodePosition: offset + 1 + relativePosition,
        sceneId: currentSceneId!,
        blockIndex,
        options,
      }));
      blockIndex++;
      return false;
    });
  });

  if (currentSceneId && currentSceneIsMaterialized) materializedSceneIds.push(currentSceneId);
  return { matches, materializedSceneIds };
}

export function mergeLiveSearchMatches({
  data,
  dataMatches,
  liveResult,
}: {
  data: ManuscriptDataDto;
  dataMatches: ManuscriptSearchMatch[];
  liveResult: EditorSearchResult;
}): ManuscriptSearchMatch[] {
  const liveSceneIds = new Set(liveResult.materializedSceneIds);
  const matchesByScene = new Map<string, ManuscriptSearchMatch[]>();

  for (const match of dataMatches) {
    if (!liveSceneIds.has(match.sceneId)) {
      const sceneMatches = matchesByScene.get(match.sceneId) ?? [];
      sceneMatches.push(match);
      matchesByScene.set(match.sceneId, sceneMatches);
    }
  }

  for (const match of liveResult.matches) {
    const sceneMatches = matchesByScene.get(match.sceneId) ?? [];
    sceneMatches.push(match);
    matchesByScene.set(match.sceneId, sceneMatches);
  }

  return getManuscriptScenes(data).flatMap(scene => matchesByScene.get(scene.id) ?? []);
}

function getActScenes(act: ActDto): SceneDto[] {
  return (act.chapters ?? []).flatMap(chapter => chapter.scenes ?? []);
}

function isSceneDto(data: ActDto | ChapterDto | SceneDto): data is SceneDto {
  return 'chapterId' in data;
}

function isChapterDto(data: ActDto | ChapterDto): data is ChapterDto {
  return 'actId' in data;
}

function searchSceneJson(
  scene: SceneDto,
  options: ManuscriptSearchOptions,
): ManuscriptSearchMatch[] {
  const matches: ManuscriptSearchMatch[] = [];
  let blockIndex = 0;

  const visit = (node: TiptapNode): void => {
    if (EXCLUDED_PROSE_NODE_TYPES.has(node.type)) return;

    if (SEARCHABLE_TEXT_BLOCK_TYPES.has(node.type)) {
      const text = jsonNodeText(node);
      matches.push(...findTextMatches(text, options).map(match => ({
        sceneId: scene.id,
        blockIndex,
        fromOffset: match.from,
        toOffset: match.to,
      })));
      blockIndex++;
      return;
    }

    node.content?.forEach(visit);
  };

  scene.prose?.content.forEach(visit);
  return matches;
}

function jsonNodeText(node: TiptapNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (EXCLUDED_PROSE_NODE_TYPES.has(node.type)) return '';
  return node.content?.map(jsonNodeText).join('') ?? '';
}

function searchProseMirrorTextBlock({
  node,
  nodePosition,
  sceneId,
  blockIndex,
  options,
}: {
  node: ProseMirrorNode;
  nodePosition: number;
  sceneId: string;
  blockIndex: number;
  options: ManuscriptSearchOptions;
}): ManuscriptSearchMatch[] {
  const textSegments: Array<{ textFrom: number; textTo: number; documentFrom: number }> = [];
  let text = '';

  node.descendants((child, relativePosition) => {
    if (!child.isText || !child.text) return true;
    const textFrom = text.length;
    text += child.text;
    textSegments.push({
      textFrom,
      textTo: text.length,
      documentFrom: nodePosition + 1 + relativePosition,
    });
    return false;
  });

  return findTextMatches(text, options).flatMap(match => {
    const from = documentPositionAtOffset(textSegments, match.from);
    const to = documentPositionAtOffset(textSegments, match.to - 1);
    if (from === null || to === null) return [];

    return [{
      sceneId,
      blockIndex,
      fromOffset: match.from,
      toOffset: match.to,
      from,
      to: to + 1,
    }];
  });
}

function documentPositionAtOffset(
  segments: Array<{ textFrom: number; textTo: number; documentFrom: number }>,
  offset: number,
): number | null {
  const segment = segments.find(candidate => offset >= candidate.textFrom && offset < candidate.textTo);
  return segment ? segment.documentFrom + offset - segment.textFrom : null;
}
