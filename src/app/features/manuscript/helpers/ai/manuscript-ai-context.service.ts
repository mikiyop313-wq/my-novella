import { Injectable, inject } from '@angular/core';
import type { Editor } from '@tiptap/core';

import type { AiChatMessage } from '../../../../core/services/ai-state.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { CodexService } from '../../../codex/services/codex.service';
import { LibraryStore } from '../../../library/store/book.store';
import type { BookSettingsDto } from '../../../../../../shared/models/book.model';
import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import type {
  ActDto,
  SceneDto,
  TiptapJsonDoc,
} from '../../../../../../shared/models/manuscript.model';
import type { AiManuscriptContextRef } from '../../../../shared/models/ai-context.model';
import type { VectorSearchSetting } from '../../../../shared/models/vector-search.model';
import { ParagraphVectorService } from '../../../../shared/services/paragraph-vector.service';
import {
  type AutomaticSceneContent,
  type ManuscriptPromptBoundary,
  expandManuscriptRefs,
  findCurrentSceneIdBeforePosition,
  findPreviousSceneId,
  serializeAutomaticManuscript,
  serializeCodexContext,
  serializeFullOutline,
  serializeNarrativeGuidance,
  serializePartialOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
  serializeTiptapNodes,
} from '../../../../shared/utils/story-context-builder';
import { extractManuscriptHierarchyById } from '../content/manuscript-content.utils';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import type { SimilarParagraphResult } from '../../../../../../shared/models/vector.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';

export type ManuscriptAiPointOfViewSetting = BookSettingsDto['pointOfView'] | 'global';

export interface ManuscriptAiContextRequest {
  editor: Editor;
  promptPos: number;
  promptId: string;
  promptText: string;
  bookId: string;
  bookTitle?: string;
  hierarchy: readonly ActDto[];
  includeFullOutline: boolean;
  manuscriptRefs: readonly AiManuscriptContextRef[];
  manualCodexEntryIds: readonly string[];
  automaticCodexEntryIds: ReadonlySet<string>;
  codexEntries: readonly CodexEntryDto[];
  wordCount: number;
  pointOfView: ManuscriptAiPointOfViewSetting;
  povCharacterId: string | null;
  vectorSearch: VectorSearchSetting;
}

@Injectable({ providedIn: 'root' })
export class ManuscriptAiContextService {
  private readonly electronService = inject(ElectronService);
  private readonly manuscriptStructureService = inject(ManuscriptStructureService);
  private readonly codexService = inject(CodexService);
  private readonly libraryStore = inject(LibraryStore);
  private readonly saver = inject(ManuscriptProseSaverService);
  private readonly toastService = inject(ToastService);
  private readonly paragraphVectorService = inject(ParagraphVectorService);

  async buildMessages(request: ManuscriptAiContextRequest): Promise<AiChatMessage[]> {
    if (!request.bookId) throw new Error('No active book is available for AI context.');

    const editorDoc = request.editor.state.doc;
    const currentSceneId = findCurrentSceneIdBeforePosition(editorDoc, request.promptPos);
    const currentSceneHierarchy = currentSceneId
      ? extractManuscriptHierarchyById(request.editor, currentSceneId)
      : null;
    const currentScene = currentSceneId
      ? findSceneById(currentSceneHierarchy, currentSceneId)
      : null;
    const promptBoundary = currentSceneId
      ? createPromptBoundary(currentSceneId, currentScene?.prose, request.promptId)
      : undefined;
    const currentProseBeforePrompt = promptBoundary?.beforePromptProse ?? '';
    const selectedSceneIds = expandManuscriptRefs(request.hierarchy, request.manuscriptRefs);
    const usesAutomaticFallback = !request.includeFullOutline && request.manuscriptRefs.length === 0;
    const precedingSceneId = currentSceneId
      ? findPreviousSceneId(request.hierarchy, currentSceneId)
      : null;
    const hasPartialOutline = !request.includeFullOutline
      && precedingSceneId !== null;
    const previousSceneId = usesAutomaticFallback ? precedingSceneId : null;
    const proseSceneIds = new Set(selectedSceneIds);
    if (previousSceneId) proseSceneIds.add(previousSceneId);

    const proseBySceneId = new Map<string, string>();
    const unloadedSceneIds: string[] = [];
    for (const sceneId of proseSceneIds) {
      const extractedScene = sceneId === currentSceneId
        ? currentScene
        : findSceneById(
          extractManuscriptHierarchyById(request.editor, sceneId),
          sceneId,
        );
      if (!extractedScene || extractedScene.prose === null) unloadedSceneIds.push(sceneId);
      else proseBySceneId.set(sceneId, serializeTiptapDocument(extractedScene.prose));
    }

    if (unloadedSceneIds.length > 0) await this.saver.flushDirtySections();

    const [outlineHierarchy, databaseProse] = await Promise.all([
      request.includeFullOutline || hasPartialOutline
        ? this.manuscriptStructureService.getOutline(request.bookId)
        : Promise.resolve(null),
      unloadedSceneIds.length > 0
        ? this.electronService.invoke('manuscript:getScenesProse', { sceneIds: unloadedSceneIds }) as Promise<Record<string, TiptapJsonDoc | null>>
        : Promise.resolve({} as Record<string, TiptapJsonDoc | null>),
    ]);

    for (const sceneId of unloadedSceneIds) {
      proseBySceneId.set(sceneId, serializeTiptapDocument(databaseProse[sceneId]));
    }

    const manuscriptContext = request.includeFullOutline
      ? serializeFullOutline(
        outlineHierarchy ?? [],
        request.bookTitle,
        proseForScenes(proseBySceneId, selectedSceneIds),
        promptBoundary,
      )
      : request.manuscriptRefs.length > 0
        ? serializeSelectedManuscript(
          request.hierarchy,
          request.bookTitle,
          request.manuscriptRefs,
          selectedSceneIds,
          proseForScenes(proseBySceneId, selectedSceneIds),
          promptBoundary,
        )
        : this.buildAutomaticContext(
          request.hierarchy,
          currentSceneId,
          currentProseBeforePrompt,
          previousSceneId,
          proseBySceneId,
        );
    const partialOutline = hasPartialOutline && currentSceneId
      ? serializePartialOutline(outlineHierarchy ?? [], request.bookTitle, currentSceneId)
      : '';

    const pointOfView = request.pointOfView === 'global'
      ? this.resolveGlobalPointOfView(request.bookId)
      : request.pointOfView;
    const povCharacter = request.povCharacterId
      ? request.codexEntries.find(entry =>
        entry.id === request.povCharacterId
        && entry.type === 'character'
        && entry.status === 'active'
        && entry.name.trim().length > 0,
      )
      : undefined;
    const narrativeGuidance = serializeNarrativeGuidance(
      pointOfView,
      povCharacter?.name,
      request.wordCount,
    );

    const codexEntryIds = this.resolveCodexEntryIds(request, povCharacter?.id);
    const codexDetails = (await Promise.all(codexEntryIds.map(id => this.codexService.getEntry(id))))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      .filter(entry => entry.status === 'active' && entry.trackingSetting !== 'never_include');
    const codexContext = serializeCodexContext(
      codexDetails,
      request.hierarchy,
      currentSceneId,
    );
    const vectorContext = await this.buildVectorContext(request);

    const messages: AiChatMessage[] = [];
    if (narrativeGuidance || manuscriptContext || codexContext || vectorContext) {
      messages.push({
        role: 'user',
        content: [
          '--- BEGIN STORY CONTEXT ---',
          narrativeGuidance,
          partialOutline,
          manuscriptContext,
          codexContext,
          vectorContext,
          '--- END STORY CONTEXT ---',
        ].filter(Boolean).join('\n\n'),
      });
    }
    messages.push({ role: 'user', content: request.promptText });
    return messages;
  }

  private buildAutomaticContext(
    hierarchy: readonly ActDto[],
    currentSceneId: string | null,
    currentProseBeforePrompt: string,
    previousSceneId: string | null,
    proseBySceneId: ReadonlyMap<string, string>,
  ): string {
    if (!currentSceneId) return '';

    const sceneContent = new Map<string, AutomaticSceneContent>();
    if (previousSceneId) {
      sceneContent.set(previousSceneId, {
        label: 'Full prose',
        text: proseBySceneId.get(previousSceneId) ?? '',
      });
    }
    sceneContent.set(currentSceneId, {
      label: 'Prose',
      text: currentProseBeforePrompt,
    });
    return serializeAutomaticManuscript(hierarchy, sceneContent);
  }

  private resolveCodexEntryIds(
    request: ManuscriptAiContextRequest,
    povCharacterId: string | undefined,
  ): string[] {
    const cachedEntries = new Map(request.codexEntries.map(entry => [entry.id, entry]));
    const includedIds = new Set([
      ...request.manualCodexEntryIds,
      ...request.automaticCodexEntryIds,
    ]);
    if (povCharacterId) includedIds.add(povCharacterId);

    return [...includedIds].filter(id => {
      const entry = cachedEntries.get(id);
      return entry?.status === 'active' && entry.trackingSetting !== 'never_include';
    });
  }

  private resolveGlobalPointOfView(bookId: string): BookSettingsDto['pointOfView'] {
    return this.libraryStore.books().find(book => book.id === bookId)?.settings?.pointOfView
      ?? 'third_limited';
  }

  private async buildVectorContext(request: ManuscriptAiContextRequest): Promise<string> {
    if (!this.isVectorSearchEnabled(request)) return '';

    try {
      await this.saver.flushDirtySections();
      await this.saver.flushParagraphVectorChanges();
      const results = await this.paragraphVectorService.searchSimilarParagraphs({
        bookId: request.bookId,
        query: request.promptText,
        limit: 3,
      });
      return serializeSimilarParagraphs(results, request.hierarchy);
    } catch (error) {
      console.warn('[ManuscriptAiContext] Vector context unavailable:', error);
      this.toastService.warning(
        'Semantic manuscript context is unavailable. Generation will continue without it.',
        'AI Context',
      );
      return '';
    }
  }

  private isVectorSearchEnabled(request: ManuscriptAiContextRequest): boolean {
    if (request.vectorSearch === 'enabled') return true;
    if (request.vectorSearch === 'disabled') return false;
    return this.libraryStore.books()
      .find(book => book.id === request.bookId)
      ?.settings?.vectorSearchEnabled ?? true;
  }
}

function createPromptBoundary(
  sceneId: string,
  prose: TiptapJsonDoc | null | undefined,
  promptId: string,
): ManuscriptPromptBoundary {
  const promptIndex = prose?.content.findIndex(
    (node) => node.type === 'aiPrompt' && node.attrs?.['id'] === promptId,
  ) ?? -1;
  if (!prose || promptIndex < 0) {
    throw new Error(`AI prompt '${promptId}' was not found in scene '${sceneId}'.`);
  }

  return {
    sceneId,
    beforePromptProse: serializeTiptapNodes(prose.content.slice(0, promptIndex)),
    afterPromptProse: serializeTiptapNodes(prose.content.slice(promptIndex + 1)),
  };
}

function findSceneById(
  hierarchy: readonly ActDto[] | null,
  sceneId: string,
): SceneDto | null {
  if (!hierarchy) return null;
  for (const act of hierarchy) {
    for (const chapter of act.chapters ?? []) {
      const scene = (chapter.scenes ?? []).find(candidate => candidate.id === sceneId);
      if (scene) return scene;
    }
  }
  return null;
}

function proseForScenes(
  proseBySceneId: ReadonlyMap<string, string>,
  sceneIds: ReadonlySet<string>,
): Map<string, string> {
  return new Map([...sceneIds].map(sceneId => [sceneId, proseBySceneId.get(sceneId) ?? '']));
}

const VECTOR_CONTEXT_CHARACTER_LIMIT = 6_000;
const VECTOR_CONTEXT_GUIDANCE = [
  'The following passages were selected automatically by semantic similarity and may be irrelevant.',
  'Treat them as optional reference material, not content that must appear in the response.',
  'Ignore anything unhelpful. When using relevant information, integrate it naturally and preferably',
  'rephrase it; avoid repeating or closely copying the original prose.',
].join(' ');

function serializeSimilarParagraphs(
  results: readonly SimilarParagraphResult[],
  hierarchy: readonly ActDto[],
): string {
  if (results.length === 0) return '';

  const sceneLocations = new Map<string, string>();
  for (const act of hierarchy) {
    for (const chapter of act.chapters ?? []) {
      for (const scene of chapter.scenes ?? []) {
        sceneLocations.set(scene.id, [
          formatHierarchyPart('Act', act.position, act.title),
          formatHierarchyPart('Chapter', chapter.position, chapter.title),
          formatHierarchyPart('Scene', scene.position, scene.title),
        ].join(' > '));
      }
    }
  }

  const heading = '## Semantically Relevant Manuscript Paragraphs';
  let remaining = VECTOR_CONTEXT_CHARACTER_LIMIT
    - heading.length
    - VECTOR_CONTEXT_GUIDANCE.length
    - 4;
  const paragraphs: string[] = [];

  for (const [index, result] of results.entries()) {
    if (remaining <= 0) break;
    const location = sceneLocations.get(result.sceneId) ?? `Scene: ${result.sceneId}`;
    const prefix = `${index + 1}. [${location}]\n`;
    const availableText = Math.max(remaining - prefix.length, 0);
    if (availableText === 0) break;
    const text = result.text.slice(0, availableText);
    const section = `${prefix}${text}`;
    paragraphs.push(section);
    remaining -= section.length + 2;
  }

  return paragraphs.length > 0
    ? `${heading}\n\n${VECTOR_CONTEXT_GUIDANCE}\n\n${paragraphs.join('\n\n')}`
    : '';
}

function formatHierarchyPart(type: string, position: number, title: string): string {
  const normalizedTitle = title.trim();
  return `${type} ${position + 1}${normalizedTitle ? `: ${normalizedTitle}` : ''}`;
}
