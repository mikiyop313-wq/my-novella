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
const SELECTED_MANUSCRIPT_HEADING = '## Selected Manuscript Context';
const AUTOMATIC_MANUSCRIPT_HEADING = '## Automatic Manuscript Context';
const NARRATIVE_GUIDANCE_HEADING = '## Narrative Guidance';
const CODEX_CONTEXT_HEADING = '## Codex Context';

const PROSE_LABEL = 'Prose';
const POINT_OF_VIEW_LABEL = 'Point of View';
const MINIMUM_LENGTH_LABEL = 'Minimum Length';
const POV_CHARACTER_LABEL = 'POV Character';
const CODEX_TYPE_LABEL = 'Type';
const CODEX_NAME_LABEL = 'Name';
const CODEX_ALIASES_LABEL = 'Aliases';
const CODEX_DESCRIPTION_LABEL = 'Description';
const CODEX_PROGRESSION_LABEL = 'Progression';
const SUMMARY_LABEL = 'Summary';

const CODEX_ENTRY_BEGIN_MARKER = '--- BEGIN CODEX ENTRY ---';
const CODEX_ENTRY_END_MARKER = '--- END CODEX ENTRY ---';
const ENTITY_BEGIN_MARKER = '--- BEGIN';
const ENTITY_END_MARKER = '--- END';
const ENTITY_MARKER_SUFFIX = '---';

const FUTURE_PROSE_GUIDANCE =
  '[THE FOLLOWING PROSE AND ANY SUBSEQUENT SCENES, CHAPTERS, OR ACTS OCCUR AFTER THE INSERTION POINT. USE THEM ONLY AS FUTURE CONTEXT.]';
const FUTURE_MANUSCRIPT_GUIDANCE =
  '[THE FOLLOWING MANUSCRIPT CONTEXT OCCURS AFTER THE INSERTION POINT. USE IT ONLY AS FUTURE CONTEXT.]';

export interface AutomaticSceneContent {
  label: 'Full prose' | 'Prose';
  text: string;
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

export interface SelectionEditPromptContext {
  prompt: string;
  sceneId: string;
  sceneContent: string;
  selectedProse: string;
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
  const selected = new Set(refs);
  const sceneIds = new Set<string>();

  if (selected.has('novel')) {
    flattenScenes(hierarchy).forEach((scene) => sceneIds.add(scene.id));
    return sceneIds;
  }

  for (const act of hierarchy) {
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
  return currentIndex > 0 ? scenes[currentIndex - 1].id : null;
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

/** Builds a scene-local user prompt for an AI edit of the selected prose. */
export function buildSelectionEditPrompt(
  doc: ProseMirrorNode,
  selection: SelectionEditRange,
  instruction: string,
  additionalContext: SelectionEditAdditionalContext = {},
): SelectionEditPromptContext | null {
  const trimmedInstruction = instruction.trim();
  if (selection.from >= selection.to || !trimmedInstruction) return null;

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
    prompt: [
      '--- STORY CONTEXT ---',
      additionalContext.partialOutline?.trim() ?? '',
      sceneIncludedInOutline ? '' : `Scene: ${scene.title}\n`,
      sceneIncludedInOutline ? '' : sceneContent,
      additionalContext.codexContext?.trim() ?? '',
      '--- END STORY CONTEXT ---\n',
      `Instruction: ${trimmedInstruction}`,
      'Edit only the marked passage. Use the surrounding scene for continuity.',
      'Return only its replacement text.',
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
  const body = serializeHierarchy({
    hierarchy,
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
  });

  return body ? `${FULL_OUTLINE_HEADING}\n\n${body}` : '';
}

export function serializePartialOutline(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  currentSceneId: string,
  currentSceneContent?: string,
): string {
  const scenes = flattenScenes(hierarchy);
  const currentSceneIndex = scenes.findIndex((scene) => scene.id === currentSceneId);
  const includeCurrentScene = currentSceneContent !== undefined;
  if (currentSceneIndex < 0 || (currentSceneIndex === 0 && !includeCurrentScene)) return '';

  const precedingSceneIds = new Set(
    scenes
      .slice(0, currentSceneIndex + (includeCurrentScene ? 1 : 0))
      .map((scene) => scene.id),
  );
  const body = serializeHierarchy({
    hierarchy,
    bookTitle,
    includeAll: false,
    includeNovel: true,
    includeParentSummaries: false,
    includeSceneSummaries: true,
    sceneSummaryExclusions: includeCurrentScene ? new Set([currentSceneId]) : undefined,
    selectedSceneIds: precedingSceneIds,
    sceneContent: includeCurrentScene
      ? new Map([[currentSceneId, { label: PROSE_LABEL, text: currentSceneContent }]])
      : new Map(),
  });

  return body ? `${OUTLINE_HEADING}\n\n${body}` : '';
}

export function serializeSelectedManuscript(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  refs: readonly AiManuscriptContextRef[],
  selectedSceneIds: ReadonlySet<string>,
  proseBySceneId: ReadonlyMap<string, string>,
  promptBoundary?: ManuscriptPromptBoundary,
): string {
  const body = serializeHierarchy({
    hierarchy,
    bookTitle,
    includeAll: false,
    includeNovel: refs.includes('novel'),
    includeParentSummaries: false,
    includeSceneSummaries: false,
    selectedSceneIds,
    sceneContent: new Map(
      [...proseBySceneId].map(([sceneId, text]) => [sceneId, { label: PROSE_LABEL, text }]),
    ),
    promptBoundary,
  });

  return body ? `${SELECTED_MANUSCRIPT_HEADING}\n\n${body}` : '';
}

export function serializeAutomaticManuscript(
  hierarchy: readonly ActDto[],
  sceneContent: ReadonlyMap<string, AutomaticSceneContent>,
): string {
  const body = serializeHierarchy({
    hierarchy,
    includeAll: false,
    includeNovel: false,
    includeParentSummaries: false,
    includeSceneSummaries: false,
    selectedSceneIds: new Set(sceneContent.keys()),
    sceneContent,
  });

  return body ? `${AUTOMATIC_MANUSCRIPT_HEADING}\n\n${body}` : '';
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
  const sceneLocations = progressionLocations(hierarchy);
  const currentRank = currentSceneId ? sceneRanks.get(currentSceneId) : undefined;
  const serializedEntries = entries
    .filter((entry) => entry.status === 'active' && entry.trackingSetting !== 'never_include')
    .map((entry) => {
      const fields = [
        CODEX_ENTRY_BEGIN_MARKER,
        `${CODEX_TYPE_LABEL}: ${displayCodexType(entry.type)}`,
        `${CODEX_NAME_LABEL}: ${entry.name.trim()}`,
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

      const progression = applicableProgression(entry.entryProgression, sceneRanks, currentRank);
      if (progression.length > 0) {
        fields.push(
          `${CODEX_PROGRESSION_LABEL}:\n${progression
            .map((item) => progressionLine(item, sceneLocations.get(item.sceneId ?? '')))
            .join('\n')}`,
        );
      }

      fields.push(CODEX_ENTRY_END_MARKER);
      return fields.join('\n\n');
    });

  return serializedEntries.length > 0
    ? `${CODEX_CONTEXT_HEADING}\n\n${serializedEntries.join('\n\n')}`
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

function serializeHierarchy(request: HierarchySerializationRequest): string {
  const state = createSerializationState(request);
  const acts = request.hierarchy
    .map((act, actIndex) => serializeAct(act, actIndex, request, state))
    .filter(Boolean);
  if (acts.length === 0 && !request.includeNovel) return '';

  const body = acts.join('\n\n');
  if (!request.includeNovel) return body;

  const delimiter = entityDelimiter('NOVEL', undefined, request.bookTitle);
  return [delimiter.begin, body, delimiter.end].filter(Boolean).join('\n\n');
}

function serializeAct(
  act: ActDto,
  actIndex: number,
  request: HierarchySerializationRequest,
  state: HierarchySerializationState,
): string {
  if (!shouldIncludeAct(act, request)) return '';

  const boundary = boundaryBeforeEntity(
    comparePathPart(actIndex, state.currentPath?.actIndex),
    request,
    state,
  );
  const chapters = (act.chapters ?? [])
    .map((chapter, chapterIndex) =>
      serializeChapter(chapter, actIndex, chapterIndex, request, state),
    )
    .filter(Boolean);

  const delimiter = entityDelimiter('ACT', act.position, act.title);
  return [
    boundary,
    delimiter.begin,
    request.includeParentSummaries ? summaryBlock(act.summary) : '',
    chapters.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeChapter(
  chapter: ChapterDto,
  actIndex: number,
  chapterIndex: number,
  request: HierarchySerializationRequest,
  state: HierarchySerializationState,
): string {
  if (!shouldIncludeChapter(chapter, request)) return '';

  const relation = actIndex === state.currentPath?.actIndex
    ? comparePathPart(chapterIndex, state.currentPath.chapterIndex)
    : 'current';
  const boundary = boundaryBeforeEntity(relation, request, state);
  const scenes = (chapter.scenes ?? [])
    .map((scene, sceneIndex) =>
      serializeScene(scene, actIndex, chapterIndex, sceneIndex, request, state),
    )
    .filter(Boolean);

  const delimiter = entityDelimiter('CHAPTER', chapter.position, chapter.title);
  return [
    boundary,
    delimiter.begin,
    request.includeParentSummaries ? summaryBlock(chapter.summary) : '',
    scenes.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeScene(
  scene: SceneDto,
  actIndex: number,
  chapterIndex: number,
  sceneIndex: number,
  request: HierarchySerializationRequest,
  state: HierarchySerializationState,
): string {
  if (!request.includeAll && !request.selectedSceneIds.has(scene.id)) return '';

  const isCurrentScene = scene.id === request.promptBoundary?.sceneId;
  const relation = actIndex === state.currentPath?.actIndex
    && chapterIndex === state.currentPath.chapterIndex
    ? comparePathPart(sceneIndex, state.currentPath.sceneIndex)
    : 'current';
  const boundary = isCurrentScene
    ? ''
    : boundaryBeforeEntity(relation, request, state);
  const delimiter = entityDelimiter('SCENE', scene.position, scene.title);
  const content = request.sceneContent.get(scene.id);
  const summary = request.includeSceneSummaries && !request.sceneSummaryExclusions?.has(scene.id)
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

function entityDelimiter(
  type: 'NOVEL' | 'ACT' | 'CHAPTER' | 'SCENE',
  position: number | undefined,
  title: string | undefined,
): { begin: string; end: string } {
  const number = position === undefined ? '' : ` ${position + 1}`;
  const cleanTitle = title?.trim();
  const suffix = cleanTitle ? ` — ${cleanTitle}` : '';
  const label = `${type}${number}${suffix}`;
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
): CodexEntryProgressionDto[] {
  if (currentRank === undefined) return [];
  return progression.filter((item) => {
    if (!item.sceneId) return false;
    const rank = sceneRanks.get(item.sceneId);
    return rank !== undefined && rank <= currentRank;
  });
}

function progressionLocations(hierarchy: readonly ActDto[]): ReadonlyMap<string, string> {
  const locations = new Map<string, string>();

  for (const act of hierarchy) {
    for (const chapter of act.chapters ?? []) {
      for (const scene of chapter.scenes ?? []) {
        locations.set(
          scene.id,
          [
            progressionLocationPart('Act', act.position, act.title),
            progressionLocationPart('Chapter', chapter.position, chapter.title),
            progressionLocationPart('Scene', scene.position, scene.title),
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
  return `${type} ${position + 1}${cleanTitle ? ` — ${cleanTitle}` : ''}`;
}

function progressionLine(item: CodexEntryProgressionDto, location: string | undefined): string {
  const title = item.title.trim();
  const description = item.description.trim();
  const content = title && description ? `${title}: ${description}` : title || description;
  return `- ${location ? `[${location}] ` : ''}${content}`;
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
