import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type {
  CodexEntryDetailDto,
  CodexEntryProgressionDto,
} from '../../../../shared/models/codex.model';
import type { BookSettingsDto } from '../../../../shared/models/book.model';
import type {
  ActDto,
  ChapterDto,
  SceneDto,
  TiptapJsonDoc,
  TiptapNode,
} from '../../../../shared/models/manuscript.model';
import type { AiManuscriptContextRef } from '../models/ai-context.model';
import {
  filterHierarchyForContext,
  isActIncludedInContext,
  isChapterIncludedInContext,
  isSceneIncludedInContext,
} from '../../../../shared/utils/manuscript-context-inclusion';

const EXCLUDED_PROSE_NODES = new Set([
  'aiPrompt',
  'aiGeneratedBlock',
  'sceneSkeleton',
  'actHeader',
  'chapterHeader',
  'sceneSummary',
]);
const STRUCTURAL_PROSE_BOUNDARY_NODES = new Set([
  'actHeader',
  'chapterHeader',
  'sceneSummary',
]);

const FULL_OUTLINE_HEADING = '## Full Outline';
const OUTLINE_HEADING = '## Outline';
const MANUSCRIPT_CONTEXT_HEADING = '## Manuscript Context';
const NARRATIVE_GUIDANCE_HEADING = '## Narrative Guidance';
const CODEX_CONTEXT_HEADING = '## Codex Context';

const PROSE_LABEL = 'Prose';
const POINT_OF_VIEW_LABEL = 'Point of View';
const MINIMUM_LENGTH_LABEL = 'Minimum Length';
const POV_CHARACTER_LABEL = 'POV Character';
const CODEX_ALIASES_LABEL = 'Aliases';
const CODEX_DESCRIPTION_LABEL = 'Description';
const CODEX_PROGRESSION_LABEL = 'Progression';
const SUMMARY_LABEL = 'Summary';

const CODEX_CONTEXT_BEGIN_MARKER = '--- BEGIN CODEX CONTEXT ---';
const CODEX_CONTEXT_END_MARKER = '--- END CODEX CONTEXT ---';
const ENTITY_BEGIN_MARKER = '--- BEGIN';
const ENTITY_END_MARKER = '--- END';
const ENTITY_MARKER_SUFFIX = '---';

const FUTURE_PROSE_GUIDANCE =
  '[THE FOLLOWING PROSE AND ANY SUBSEQUENT SCENES, CHAPTERS, OR ACTS OCCUR AFTER THE INSERTION POINT. USE THEM ONLY AS FUTURE CONTEXT.]';
const FUTURE_MANUSCRIPT_GUIDANCE =
  '[THE FOLLOWING MANUSCRIPT CONTEXT OCCURS AFTER THE INSERTION POINT. USE IT ONLY AS FUTURE CONTEXT.]';

export interface PartialOutlineContent {
  currentSceneProse?: string;
  previousScene?: {
    sceneId: string;
    prose: string;
  };
  selectedSceneProse?: ReadonlyMap<string, string>;
  promptBoundary?: ManuscriptPromptBoundary;
}

export interface ManuscriptPromptBoundary {
  sceneId: string;
  beforePromptProse: string;
  afterPromptProse: string;
}

export interface SelectionEditRange {
  from: number;
  to: number;
}

export interface SelectionEditContext {
  sceneId: string;
  sceneContent: string;
  selectedProse: string;
  storyContext: string;
}

export interface SelectionEditAdditionalContext {
  partialOutline?: string;
  codexContext?: string;
  sceneIncludedInOutline?: boolean;
}

interface SelectionEditSceneBoundary {
  id: string;
  title: string;
  proseFrom: number;
  proseTo: number;
}

export function flattenScenes(hierarchy: readonly ActDto[]): SceneDto[] {
  return hierarchy.flatMap((act) =>
    (act.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []),
  );
}

export function expandManuscriptRefs(
  hierarchy: readonly ActDto[],
  refs: readonly AiManuscriptContextRef[],
): Set<string> {
  const selectableHierarchy = filterHierarchyForContext(hierarchy);
  const selected = new Set(refs);
  const sceneIds = new Set<string>();

  if (selected.has('novel')) {
    flattenScenes(selectableHierarchy).forEach((scene) => sceneIds.add(scene.id));
    return sceneIds;
  }

  for (const act of selectableHierarchy) {
    if (selected.has(`act:${act.id}`)) {
      scenesForAct(act).forEach((scene) => sceneIds.add(scene.id));
      continue;
    }

    for (const chapter of act.chapters ?? []) {
      if (selected.has(`chapter:${chapter.id}`)) {
        (chapter.scenes ?? []).forEach((scene) => sceneIds.add(scene.id));
        continue;
      }

      for (const scene of chapter.scenes ?? []) {
        if (selected.has(`scene:${scene.id}`)) sceneIds.add(scene.id);
      }
    }
  }

  return sceneIds;
}

export function findPreviousSceneId(
  hierarchy: readonly ActDto[],
  currentSceneId: string,
): string | null {
  const scenes = flattenScenes(hierarchy);
  const currentIndex = scenes.findIndex((scene) => scene.id === currentSceneId);
  if (currentIndex <= 0) return null;
  return scenes.slice(0, currentIndex).reverse().find(isSceneIncludedInContext)?.id ?? null;
}

export function findCurrentSceneIdBeforePosition(
  doc: ProseMirrorNode,
  promptPos: number,
): string | null {
  let currentSceneId: string | null = null;

  doc.forEach((node, offset) => {
    if (offset >= promptPos) return;

    if (node.type.name === 'actHeader' || node.type.name === 'chapterHeader') {
      currentSceneId = null;
      return;
    }

    if (node.type.name === 'sceneSummary') {
      currentSceneId = stringAttribute(node.attrs['id']);
    }
  });

  return currentSceneId;
}

/** Extracts scene-local story context for an AI edit of the selected prose. */
export function buildSelectionEditContext(
  doc: ProseMirrorNode,
  selection: SelectionEditRange,
  additionalContext: SelectionEditAdditionalContext = {},
): SelectionEditContext | null {
  if (selection.from >= selection.to) return null;

  const scene = findSceneAroundSelection(doc, selection);
  if (!scene) return null;

  const proseBefore = serializeProseRange(doc, scene.proseFrom, selection.from);
  const selectedProse = serializeProseRange(doc, selection.from, selection.to);
  const proseAfter = serializeProseRange(doc, selection.to, scene.proseTo);
  if (!selectedProse) return null;
  const sceneContent = [
    proseBefore ? `${proseBefore}\n` : '',
    '--- PASSAGE TO EDIT ---',
    selectedProse,
    '--- END PASSAGE ---\n',
    proseAfter,
  ].filter(Boolean).join('\n');
  const sceneIncludedInOutline = additionalContext.sceneIncludedInOutline === true;

  return {
    sceneId: scene.id,
    sceneContent,
    selectedProse,
    storyContext: [
      additionalContext.partialOutline?.trim() ?? '',
      sceneIncludedInOutline ? '' : `Scene: ${scene.title}\n`,
      sceneIncludedInOutline ? '' : sceneContent,
      additionalContext.codexContext?.trim() ?? '',
    ].filter(Boolean).join('\n'),
  };
}

export function serializeTiptapDocument(doc: TiptapJsonDoc | null | undefined): string {
  return serializeTiptapNodes(doc?.content ?? []);
}

export function serializeTiptapNodes(nodes: readonly TiptapNode[]): string {
  return nodes.map(serializeBlockNode).filter(Boolean).join('\n\n').trim();
}

export function serializeFullOutline(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  proseBySceneId: ReadonlyMap<string, string>,
  promptBoundary?: ManuscriptPromptBoundary,
): string {
  const contextHierarchy = filterHierarchyForContext(
    hierarchy,
    new Set(promptBoundary ? [promptBoundary.sceneId] : []),
  );
  const body = serializeHierarchy({
    hierarchy: contextHierarchy,
    bookTitle,
    includeAll: true,
    includeNovel: true,
    includeParentSummaries: true,
    includeSceneSummaries: true,
    selectedSceneIds: new Set(proseBySceneId.keys()),
    sceneContent: new Map(
      [...proseBySceneId].map(([sceneId, text]) => [sceneId, { label: PROSE_LABEL, text }]),
    ),
    promptBoundary,
    markCurrentScene: promptBoundary !== undefined,
  });

  return body ? `${FULL_OUTLINE_HEADING}\n\n${body}` : '';
}

export function serializePartialOutline(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  currentSceneId: string,
  content: PartialOutlineContent = {},
): string {
  const contextHierarchy = filterHierarchyForContext(hierarchy, new Set([currentSceneId]));
  const scenes = flattenScenes(contextHierarchy);
  const currentSceneIndex = scenes.findIndex((scene) => scene.id === currentSceneId);
  if (currentSceneIndex < 0) return '';

  const renderedSceneIds = new Set(
    scenes
      .slice(0, currentSceneIndex + 1)
      .map((scene) => scene.id),
  );
  const sceneContent = new Map<string, { label: string; text: string }>();
  for (const [sceneId, prose] of content.selectedSceneProse ?? []) {
    renderedSceneIds.add(sceneId);
    sceneContent.set(sceneId, { label: PROSE_LABEL, text: prose });
  }
  if (content.previousScene) {
    sceneContent.set(content.previousScene.sceneId, {
      label: 'Full prose',
      text: content.previousScene.prose,
    });
  }
  if (content.currentSceneProse !== undefined) {
    sceneContent.set(currentSceneId, { label: PROSE_LABEL, text: content.currentSceneProse });
  }
  const hasRenderedFutureScene = scenes
    .slice(currentSceneIndex + 1)
    .some((scene) => renderedSceneIds.has(scene.id));
  const body = serializeHierarchy({
    hierarchy: contextHierarchy,
    bookTitle,
    includeAll: false,
    includeNovel: true,
    includeParentSummaries: false,
    includeSceneSummaries: true,
    sceneSummaryExclusions: new Set([...sceneContent.keys(), currentSceneId]),
    selectedSceneIds: renderedSceneIds,
    sceneContent,
    promptBoundary: content.promptBoundary,
    markCurrentScene: hasRenderedFutureScene && content.promptBoundary !== undefined,
  });

  return body ? `${OUTLINE_HEADING}\n\n${body}` : '';
}

export function serializeSelectedManuscript(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  selectedSceneIds: ReadonlySet<string>,
  proseBySceneId: ReadonlyMap<string, string>,
  promptBoundary?: ManuscriptPromptBoundary,
): string {
  const contextHierarchy = filterHierarchyForContext(hierarchy);
  const allowedSceneIds = new Set(flattenScenes(contextHierarchy).map((scene) => scene.id));
  const body = serializeHierarchy({
    hierarchy: contextHierarchy,
    bookTitle,
    includeAll: false,
    includeNovel: true,
    includeParentSummaries: false,
    includeSceneSummaries: false,
    selectedSceneIds: new Set([...selectedSceneIds].filter((id) => allowedSceneIds.has(id))),
    sceneContent: new Map(
      [...proseBySceneId].map(([sceneId, text]) => [sceneId, { label: PROSE_LABEL, text }]),
    ),
    promptBoundary,
    markCurrentScene: false,
  });

  return body ? `${MANUSCRIPT_CONTEXT_HEADING}\n\n${body}` : '';
}

export function serializeNarrativeGuidance(
  pointOfView: BookSettingsDto['pointOfView'],
  povCharacterName: string | null | undefined,
  wordCount: number,
): string {
  const fields = [`${POINT_OF_VIEW_LABEL}: ${displayPointOfView(pointOfView)}`];
  if (Number.isFinite(wordCount) && wordCount > 0) {
    fields.push(`${MINIMUM_LENGTH_LABEL}: Write at least ${wordCount} words.`);
  }
  const cleanCharacterName = povCharacterName?.trim();
  if (cleanCharacterName) fields.push(`${POV_CHARACTER_LABEL}: ${cleanCharacterName}`);

  return `${NARRATIVE_GUIDANCE_HEADING}\n\n${fields.join('\n')}`;
}

export function serializeCodexContext(
  entries: readonly CodexEntryDetailDto[],
  hierarchy: readonly ActDto[],
  currentSceneId: string | null,
): string {
  const sceneRanks = new Map(flattenScenes(hierarchy).map((scene, index) => [scene.id, index]));
  const contextHierarchy = filterHierarchyForContext(hierarchy);
  const includedSceneIds = new Set(
    flattenScenes(contextHierarchy).map((scene) => scene.id),
  );
  const currentRank = currentSceneId ? sceneRanks.get(currentSceneId) : undefined;
  const eligibleEntries = entries.filter(
    (entry) => entry.status === 'active' && entry.trackingSetting !== 'never_include',
  );
  const progressionByEntryId = new Map(eligibleEntries.map((entry) => [
    entry.id,
    applicableProgression(entry.entryProgression, sceneRanks, currentRank, includedSceneIds),
  ]));
  const sceneLocations = progressionLocations(contextHierarchy);
  const entriesByType = new Map<CodexEntryDetailDto['type'], CodexEntryDetailDto[]>();
  for (const entry of eligibleEntries) {
    const groupedEntries = entriesByType.get(entry.type) ?? [];
    groupedEntries.push(entry);
    entriesByType.set(entry.type, groupedEntries);
  }
  const serializedGroups = [...entriesByType].map(([type, groupedEntries]) => {
    const serializedEntries = groupedEntries.map((entry) => {
      const fields = [
        `### ${entry.name.trim()}`,
      ];
      const aliases = entry.alias
        ?.split(',')
        .map((alias) => alias.trim())
        .filter(Boolean)
        .join(', ');
      if (aliases) fields.push(`${CODEX_ALIASES_LABEL}: ${aliases}`);
      if (entry.description?.trim()) {
        fields.push(`${CODEX_DESCRIPTION_LABEL}:\n${entry.description.trim()}`);
      }

      const progression = progressionByEntryId.get(entry.id) ?? [];
      if (progression.length > 0) {
        fields.push(
          `${CODEX_PROGRESSION_LABEL}:\n${progression
            .map((item, index) => progressionBlock({
              item,
              location: sceneLocations.get(item.sceneId ?? ''),
              index,
            }))
            .join('\n\n')}`,
        );
      }
      return fields.join('\n\n');
    });
    return [
      `--- ${displayCodexType(type).toUpperCase()} ---`,
      serializedEntries.join('\n\n'),
    ].join('\n\n');
  });

  return serializedGroups.length > 0
    ? [
      CODEX_CONTEXT_HEADING,
      CODEX_CONTEXT_BEGIN_MARKER,
      serializedGroups.join('\n\n'),
      CODEX_CONTEXT_END_MARKER,
    ].join('\n\n')
    : '';
}

interface HierarchySerializationRequest {
  hierarchy: readonly ActDto[];
  bookTitle?: string;
  includeAll: boolean;
  includeNovel: boolean;
  includeParentSummaries: boolean;
  includeSceneSummaries: boolean;
  sceneSummaryExclusions?: ReadonlySet<string>;
  selectedSceneIds: ReadonlySet<string>;
  sceneContent: ReadonlyMap<string, { label: string; text: string }>;
  promptBoundary?: ManuscriptPromptBoundary;
  markCurrentScene: boolean;
}

interface HierarchySerializationState {
  boundaryRendered: boolean;
  currentPath: ScenePath | null;
}

interface ScenePath {
  actIndex: number;
  chapterIndex: number;
  sceneIndex: number;
}

interface SerializationPosition {
  sourceIndex: number;
  displayPosition: number;
}

interface SerializeActRequest {
  act: ActDto;
  position: SerializationPosition;
  request: HierarchySerializationRequest;
  state: HierarchySerializationState;
}

interface SerializeChapterRequest {
  chapter: ChapterDto;
  actSourceIndex: number;
  position: SerializationPosition;
  request: HierarchySerializationRequest;
  state: HierarchySerializationState;
}

interface SerializeSceneRequest {
  scene: SceneDto;
  actSourceIndex: number;
  chapterSourceIndex: number;
  position: SerializationPosition;
  request: HierarchySerializationRequest;
  state: HierarchySerializationState;
}

function serializeHierarchy(request: HierarchySerializationRequest): string {
  const state = createSerializationState(request);
  const acts = request.hierarchy
    .map((act, sourceIndex) => ({ act, sourceIndex }))
    .filter(({ act }) => shouldIncludeAct(act, request))
    .map(({ act, sourceIndex }, displayPosition) => serializeAct({
      act,
      position: { sourceIndex, displayPosition },
      request,
      state,
    }));
  if (acts.length === 0) return '';

  const body = acts.join('\n\n');
  if (!request.includeNovel) return body;

  const delimiter = entityDelimiter({
    type: 'NOVEL',
    position: undefined,
    title: request.bookTitle,
  });
  return [delimiter.begin, body, delimiter.end].filter(Boolean).join('\n\n');
}

function serializeAct(
  { act, position, request, state }: SerializeActRequest,
): string {
  const boundary = boundaryBeforeEntity(
    comparePathPart(position.sourceIndex, state.currentPath?.actIndex),
    request,
    state,
  );
  const chapters = (act.chapters ?? [])
    .map((chapter, sourceIndex) => ({ chapter, sourceIndex }))
    .filter(({ chapter }) => shouldIncludeChapter(chapter, request))
    .map(({ chapter, sourceIndex }, displayPosition) => serializeChapter({
      chapter,
      actSourceIndex: position.sourceIndex,
      position: { sourceIndex, displayPosition },
      request,
      state,
    }));

  const delimiter = entityDelimiter({
    type: 'ACT',
    position: position.displayPosition,
    title: act.title,
  });
  return [
    boundary,
    delimiter.begin,
    request.includeParentSummaries && isActIncludedInContext(act) ? summaryBlock(act.summary) : '',
    chapters.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeChapter(
  { chapter, actSourceIndex, position, request, state }: SerializeChapterRequest,
): string {
  const relation = actSourceIndex === state.currentPath?.actIndex
    ? comparePathPart(position.sourceIndex, state.currentPath.chapterIndex)
    : 'current';
  const boundary = boundaryBeforeEntity(relation, request, state);
  const scenes = (chapter.scenes ?? [])
    .map((scene, sourceIndex) => ({ scene, sourceIndex }))
    .filter(({ scene }) => shouldIncludeScene(scene, request))
    .map(({ scene, sourceIndex }, displayPosition) => serializeScene({
      scene,
      actSourceIndex,
      chapterSourceIndex: position.sourceIndex,
      position: { sourceIndex, displayPosition },
      request,
      state,
    }));

  const delimiter = entityDelimiter({
    type: 'CHAPTER',
    position: position.displayPosition,
    title: chapter.title,
  });
  return [
    boundary,
    delimiter.begin,
    request.includeParentSummaries && isChapterIncludedInContext(chapter)
      ? summaryBlock(chapter.summary)
      : '',
    scenes.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeScene(
  {
    scene,
    actSourceIndex,
    chapterSourceIndex,
    position,
    request,
    state,
  }: SerializeSceneRequest,
): string {
  const isCurrentScene = scene.id === request.promptBoundary?.sceneId;
  const relation = actSourceIndex === state.currentPath?.actIndex
    && chapterSourceIndex === state.currentPath.chapterIndex
    ? comparePathPart(position.sourceIndex, state.currentPath.sceneIndex)
    : 'current';
  const boundary = isCurrentScene
    ? ''
    : boundaryBeforeEntity(relation, request, state);
  const delimiter = entityDelimiter({
    type: 'SCENE',
    position: position.displayPosition,
    title: scene.title,
    currentScene: isCurrentScene && request.markCurrentScene,
  });
  const content = request.sceneContent.get(scene.id);
  const summary = request.includeSceneSummaries
    && isSceneIncludedInContext(scene)
    && !request.sceneSummaryExclusions?.has(scene.id)
    ? summaryBlock(scene.summary)
    : '';

  if (isCurrentScene && content) {
    const beforePromptProse = request.promptBoundary?.beforePromptProse.trim() ?? '';
    const afterPromptProse = request.promptBoundary?.afterPromptProse.trim() ?? '';
    const promptBoundary = afterPromptProse
      ? renderPromptBoundary(request, state, true)
      : '';
    const prose = beforePromptProse || afterPromptProse
      ? [
        beforePromptProse ? `${PROSE_LABEL}:\n${beforePromptProse}` : `${PROSE_LABEL}:`,
        promptBoundary,
        afterPromptProse,
      ].filter(Boolean).join('\n\n')
      : '';

    return [
      delimiter.begin,
      summary,
      prose,
      delimiter.end,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    boundary,
    delimiter.begin,
    summary,
    content?.text.trim() ? `${content.label}:\n${content.text.trim()}` : '',
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function createSerializationState(
  request: HierarchySerializationRequest,
): HierarchySerializationState {
  if (!request.promptBoundary) {
    return { boundaryRendered: false, currentPath: null };
  }

  for (const [actIndex, act] of request.hierarchy.entries()) {
    for (const [chapterIndex, chapter] of (act.chapters ?? []).entries()) {
      const sceneIndex = (chapter.scenes ?? [])
        .findIndex((scene) => scene.id === request.promptBoundary?.sceneId);
      if (sceneIndex >= 0) {
        return {
          boundaryRendered: false,
          currentPath: { actIndex, chapterIndex, sceneIndex },
        };
      }
    }
  }

  return { boundaryRendered: false, currentPath: null };
}

function shouldIncludeAct(act: ActDto, request: HierarchySerializationRequest): boolean {
  return request.includeAll
    || (act.chapters ?? []).some((chapter) => shouldIncludeChapter(chapter, request));
}

function shouldIncludeChapter(
  chapter: ChapterDto,
  request: HierarchySerializationRequest,
): boolean {
  return request.includeAll
    || (chapter.scenes ?? []).some((scene) => request.selectedSceneIds.has(scene.id));
}

function shouldIncludeScene(scene: SceneDto, request: HierarchySerializationRequest): boolean {
  return request.includeAll || request.selectedSceneIds.has(scene.id);
}

function comparePathPart(
  index: number,
  currentIndex: number | undefined,
): 'before' | 'current' | 'after' {
  if (currentIndex === undefined || index === currentIndex) return 'current';
  return index < currentIndex ? 'before' : 'after';
}

function boundaryBeforeEntity(
  relation: 'before' | 'current' | 'after',
  request: HierarchySerializationRequest,
  state: HierarchySerializationState,
): string {
  return relation === 'after' ? renderPromptBoundary(request, state) : '';
}

function renderPromptBoundary(
  request: HierarchySerializationRequest,
  state: HierarchySerializationState,
  hasFollowingProse = false,
): string {
  if (state.boundaryRendered || !request.promptBoundary || !state.currentPath) return '';

  state.boundaryRendered = true;
  return hasFollowingProse
    ? FUTURE_PROSE_GUIDANCE
    : FUTURE_MANUSCRIPT_GUIDANCE;
}

function entityDelimiter({
  type,
  position,
  title,
  currentScene = false,
}: {
  type: 'NOVEL' | 'ACT' | 'CHAPTER' | 'SCENE';
  position: number | undefined;
  title: string | undefined;
  currentScene?: boolean;
}): { begin: string; end: string } {
  const number = position === undefined ? '' : ` ${position + 1}`;
  const currentSceneLabel = currentScene ? ' [CURRENT SCENE]' : '';
  const cleanTitle = title?.trim();
  const suffix = cleanTitle ? ` — ${cleanTitle}` : '';
  const label = `${type}${number}${currentSceneLabel}${suffix}`;
  return {
    begin: `${ENTITY_BEGIN_MARKER} ${label} ${ENTITY_MARKER_SUFFIX}`,
    end: `${ENTITY_END_MARKER} ${label} ${ENTITY_MARKER_SUFFIX}`,
  };
}

function summaryBlock(summary: string | null | undefined): string {
  return summary?.trim() ? `${SUMMARY_LABEL}:\n${summary.trim()}` : '';
}

function serializeBlockNode(node: TiptapNode): string {
  if (EXCLUDED_PROSE_NODES.has(node.type)) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';

  const children = (node.content ?? []).map(serializeBlockNode).filter(Boolean);
  if (node.type === 'bulletList' || node.type === 'orderedList') return children.join('\n');
  if (node.type === 'listItem') {
    const text = children.join('\n').trim();
    return text ? `- ${text.replace(/\n/g, '\n  ')}` : '';
  }

  return children.join('');
}

function findSceneAroundSelection(
  doc: ProseMirrorNode,
  selection: SelectionEditRange,
): SelectionEditSceneBoundary | null {
  let candidate: SelectionEditSceneBoundary | null = null;

  doc.forEach((node, offset) => {
    if (!STRUCTURAL_PROSE_BOUNDARY_NODES.has(node.type.name)) return;

    if (candidate && candidate.proseTo === doc.content.size) candidate.proseTo = offset;

    if (node.type.name === 'sceneSummary' && offset < selection.from) {
      candidate = {
        id: stringAttribute(node.attrs['id']) ?? '',
        title: stringAttribute(node.attrs['title']) ?? '',
        proseFrom: offset + node.nodeSize,
        proseTo: doc.content.size,
      };
    }
  });

  const resolvedCandidate = candidate as SelectionEditSceneBoundary | null;
  if (
    !resolvedCandidate
    || selection.from < resolvedCandidate.proseFrom
    || selection.to > resolvedCandidate.proseTo
  ) {
    return null;
  }
  return resolvedCandidate;
}

function serializeProseRange(doc: ProseMirrorNode, from: number, to: number): string {
  if (from >= to) return '';

  const blocks: string[] = [];
  doc.forEach((node, offset) => {
    const nodeTo = offset + node.nodeSize;
    const intersectsRange = nodeTo > from && offset < to;
    if (!intersectsRange || EXCLUDED_PROSE_NODES.has(node.type.name)) return;

    const contentFrom = Math.max(from, offset + 1);
    const contentTo = Math.min(to, nodeTo - 1);
    if (contentFrom >= contentTo) return;

    const text = doc.textBetween(contentFrom, contentTo, '\n').trim();
    if (text) blocks.push(text);
  });
  return blocks.join('\n\n');
}

function applicableProgression(
  progression: readonly CodexEntryProgressionDto[],
  sceneRanks: ReadonlyMap<string, number>,
  currentRank: number | undefined,
  includedSceneIds: ReadonlySet<string>,
): CodexEntryProgressionDto[] {
  if (currentRank === undefined) return [];
  return progression.filter((item) => {
    if (!item.sceneId || !includedSceneIds.has(item.sceneId)) return false;
    const rank = sceneRanks.get(item.sceneId);
    return rank !== undefined && rank <= currentRank;
  });
}

function progressionLocations(hierarchy: readonly ActDto[]): ReadonlyMap<string, string> {
  const locations = new Map<string, string>();

  for (const [actIndex, act] of hierarchy.entries()) {
    for (const [chapterIndex, chapter] of (act.chapters ?? []).entries()) {
      for (const [sceneIndex, scene] of (chapter.scenes ?? []).entries()) {
        locations.set(
          scene.id,
          [
            progressionLocationPart('Act', actIndex, act.title),
            progressionLocationPart('Chapter', chapterIndex, chapter.title),
            progressionLocationPart('Scene', sceneIndex, scene.title),
          ].join(' > '),
        );
      }
    }
  }

  return locations;
}

function progressionLocationPart(
  type: 'Act' | 'Chapter' | 'Scene',
  position: number,
  title: string,
): string {
  const cleanTitle = title.trim();
  return `${type} ${position + 1}${cleanTitle ? `: ${cleanTitle}` : ''}`;
}

function progressionBlock({
  item,
  location,
  index,
}: {
  item: CodexEntryProgressionDto;
  location: string | undefined;
  index: number;
}): string {
  const title = item.title.trim();
  const description = item.description.trim();
  const lines = [`${index + 1})${location ? ` [${location}]` : ''}`];
  if (title) lines.push(`Title: ${title}`);
  if (description) lines.push(`Description: ${description}`);
  return lines.join('\n');
}

function displayCodexType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function displayPointOfView(pointOfView: BookSettingsDto['pointOfView']): string {
  switch (pointOfView) {
    case 'first':
      return 'First Person';
    case 'second':
      return 'Second Person';
    case 'third_omni':
      return 'Third Person Omniscient';
    case 'third_limited':
      return 'Third Person Limited';
  }
}

function scenesForAct(act: ActDto): SceneDto[] {
  return (act.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []);
}

function stringAttribute(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
