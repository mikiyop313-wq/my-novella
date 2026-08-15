import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type {
  CodexEntryDetailDto,
  CodexEntryProgressionDto,
} from '../../../../../../shared/models/codex.model';
import type {
  ActDto,
  ChapterDto,
  SceneDto,
  TiptapJsonDoc,
  TiptapNode,
} from '../../../../../../shared/models/manuscript.model';
import type { AiManuscriptContextRef } from '../../components/ai-prompt/ai-prompt-dropdown-options';

const EXCLUDED_PROSE_NODES = new Set([
  'aiPrompt',
  'aiGeneratedBlock',
  'sceneSkeleton',
  'actHeader',
  'chapterHeader',
  'sceneSummary',
]);
export interface AutomaticSceneContent {
  label: 'Full prose' | 'Prose before AI prompt';
  text: string;
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
): string {
  const body = serializeHierarchy({
    hierarchy,
    bookTitle,
    includeAll: true,
    includeNovel: true,
    includeSummaries: true,
    selectedSceneIds: new Set(proseBySceneId.keys()),
    sceneContent: new Map(
      [...proseBySceneId].map(([sceneId, text]) => [sceneId, { label: 'Prose', text }]),
    ),
  });

  return body ? `## Full Outline\n\n${body}` : '';
}

export function serializeSelectedManuscript(
  hierarchy: readonly ActDto[],
  bookTitle: string | undefined,
  refs: readonly AiManuscriptContextRef[],
  selectedSceneIds: ReadonlySet<string>,
  proseBySceneId: ReadonlyMap<string, string>,
): string {
  const body = serializeHierarchy({
    hierarchy,
    bookTitle,
    includeAll: false,
    includeNovel: refs.includes('novel'),
    includeSummaries: false,
    selectedSceneIds,
    sceneContent: new Map(
      [...proseBySceneId].map(([sceneId, text]) => [sceneId, { label: 'Prose', text }]),
    ),
  });

  return body ? `## Selected Manuscript Context\n\n${body}` : '';
}

export function serializeAutomaticManuscript(
  hierarchy: readonly ActDto[],
  sceneContent: ReadonlyMap<string, AutomaticSceneContent>,
): string {
  const body = serializeHierarchy({
    hierarchy,
    includeAll: false,
    includeNovel: false,
    includeSummaries: false,
    selectedSceneIds: new Set(sceneContent.keys()),
    sceneContent,
  });

  return body ? `## Automatic Manuscript Context\n\n${body}` : '';
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
        '--- BEGIN CODEX ENTRY ---',
        `Type: ${displayCodexType(entry.type)}`,
        `Name: ${entry.name.trim()}`,
      ];
      const aliases = entry.alias
        ?.split(',')
        .map((alias) => alias.trim())
        .filter(Boolean)
        .join(', ');
      if (aliases) fields.push(`Aliases: ${aliases}`);
      if (entry.description?.trim()) fields.push(`Description:\n${entry.description.trim()}`);

      const progression = applicableProgression(entry.entryProgression, sceneRanks, currentRank);
      if (progression.length > 0) {
        fields.push(
          `Progression:\n${progression
            .map((item) => progressionLine(item, sceneLocations.get(item.sceneId ?? '')))
            .join('\n')}`,
        );
      }

      fields.push('--- END CODEX ENTRY ---');
      return fields.join('\n\n');
    });

  return serializedEntries.length > 0
    ? `## Codex Context\n\n${serializedEntries.join('\n\n')}`
    : '';
}

interface HierarchySerializationRequest {
  hierarchy: readonly ActDto[];
  bookTitle?: string;
  includeAll: boolean;
  includeNovel: boolean;
  includeSummaries: boolean;
  selectedSceneIds: ReadonlySet<string>;
  sceneContent: ReadonlyMap<string, { label: string; text: string }>;
}

function serializeHierarchy(request: HierarchySerializationRequest): string {
  const acts = request.hierarchy.map((act) => serializeAct(act, request)).filter(Boolean);
  if (acts.length === 0 && !request.includeNovel) return '';

  const body = acts.join('\n\n');
  if (!request.includeNovel) return body;

  const delimiter = entityDelimiter('NOVEL', undefined, request.bookTitle);
  return [delimiter.begin, body, delimiter.end].filter(Boolean).join('\n\n');
}

function serializeAct(act: ActDto, request: HierarchySerializationRequest): string {
  const chapters = (act.chapters ?? [])
    .map((chapter) => serializeChapter(chapter, request))
    .filter(Boolean);
  if (!request.includeAll && chapters.length === 0) return '';

  const delimiter = entityDelimiter('ACT', act.position, act.title);
  return [
    delimiter.begin,
    request.includeSummaries ? summaryBlock(act.summary) : '',
    chapters.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeChapter(chapter: ChapterDto, request: HierarchySerializationRequest): string {
  const scenes = (chapter.scenes ?? [])
    .map((scene) => serializeScene(scene, request))
    .filter(Boolean);
  if (!request.includeAll && scenes.length === 0) return '';

  const delimiter = entityDelimiter('CHAPTER', chapter.position, chapter.title);
  return [
    delimiter.begin,
    request.includeSummaries ? summaryBlock(chapter.summary) : '',
    scenes.join('\n\n'),
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function serializeScene(scene: SceneDto, request: HierarchySerializationRequest): string {
  if (!request.includeAll && !request.selectedSceneIds.has(scene.id)) return '';

  const delimiter = entityDelimiter('SCENE', scene.position, scene.title);
  const content = request.sceneContent.get(scene.id);
  return [
    delimiter.begin,
    request.includeSummaries ? summaryBlock(scene.summary) : '',
    content?.text.trim() ? `${content.label}:\n${content.text.trim()}` : '',
    delimiter.end,
  ]
    .filter(Boolean)
    .join('\n\n');
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
    begin: `--- BEGIN ${label} ---`,
    end: `--- END ${label} ---`,
  };
}

function summaryBlock(summary: string | null | undefined): string {
  return summary?.trim() ? `Summary:\n${summary.trim()}` : '';
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

function scenesForAct(act: ActDto): SceneDto[] {
  return (act.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []);
}

function stringAttribute(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
