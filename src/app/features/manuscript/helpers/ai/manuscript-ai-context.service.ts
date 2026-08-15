import { Injectable, inject } from '@angular/core';
import type { Editor } from '@tiptap/core';

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
  type ManuscriptPromptBoundary,
  type PartialOutlineContent,
  expandManuscriptRefs,
  findCurrentSceneIdBeforePosition,
  findPreviousSceneId,
  serializeBookContext,
  serializeCodexContext,
  serializeFullOutline,
  serializeNarrativeGuidance,
  serializePartialOutline,
  serializeTiptapDocument,
  serializeTiptapNodes,
} from '../../../../shared/utils/story-context-builder';
import { extractManuscriptHierarchyById } from '../content/manuscript-content.utils';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import type { SimilarParagraphResult } from '../../../../../../shared/models/vector.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { ManuscriptStructureService } from '../../../workspace/services/manuscript-structure.service';
import {
  filterHierarchyForContext,
  isSceneIncludedInContext,
} from '../../../../../../shared/utils/manuscript-context-inclusion';

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

  async buildContext(request: ManuscriptAiContextRequest): Promise<string> {
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
    const currentContextScene = currentSceneId
      ? findSceneById(request.hierarchy, currentSceneId)
      : null;
    const currentSceneIsIncluded = currentContextScene
      ? isSceneIncludedInContext(currentContextScene)
      : false;
    const contextPromptBoundary = promptBoundary && !currentSceneIsIncluded
      ? { ...promptBoundary, afterPromptProse: '' }
      : promptBoundary;
    const currentProseBeforePrompt = promptBoundary?.beforePromptProse ?? '';
    const selectedSceneIds = expandManuscriptRefs(request.hierarchy, request.manuscriptRefs);
    const usesAutomaticProse = request.manuscriptRefs.length === 0;
    const precedingSceneId = currentSceneId
      ? findPreviousSceneId(request.hierarchy, currentSceneId)
      : null;
    const hasOutlineContext = !request.includeFullOutline && currentSceneId !== null;
    const previousSceneId = usesAutomaticProse && !currentProseBeforePrompt
      ? precedingSceneId
      : null;
    const proseSceneIds = new Set(selectedSceneIds);
    if (previousSceneId) proseSceneIds.add(previousSceneId);
    if (
      request.includeFullOutline
      && currentSceneId
      && (usesAutomaticProse || !currentSceneIsIncluded)
    ) {
      proseSceneIds.add(currentSceneId);
    }

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
      request.includeFullOutline || hasOutlineContext
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
        proseForScenes(
          proseBySceneId,
          usesAutomaticProse ? proseSceneIds : selectedSceneIds,
        ),
        contextPromptBoundary,
      )
      : '';
    const partialOutlineContent: PartialOutlineContent = {};
    if ((usesAutomaticProse || !currentSceneIsIncluded) && currentProseBeforePrompt) {
      partialOutlineContent.currentSceneProse = currentProseBeforePrompt;
    }
    if (usesAutomaticProse && previousSceneId) {
      partialOutlineContent.previousScene = {
        sceneId: previousSceneId,
        prose: proseBySceneId.get(previousSceneId) ?? '',
      };
    }
    if (request.manuscriptRefs.length > 0) {
      partialOutlineContent.selectedSceneProse = proseForScenes(
        proseBySceneId,
        selectedSceneIds,
      );
      partialOutlineContent.promptBoundary = contextPromptBoundary;
    }
    const partialOutline = hasOutlineContext && currentSceneId
      ? serializePartialOutline(
        outlineHierarchy ?? [],
        request.bookTitle,
        currentSceneId,
        partialOutlineContent,
      )
      : '';

    const activeBook = this.libraryStore.books().find(book => book.id === request.bookId);
    if (!activeBook?.settings) {
      throw new Error('Active book narrative settings are not available for AI context.');
    }

    const pointOfView = request.pointOfView === 'global'
      ? activeBook.settings.pointOfView
      : request.pointOfView;
    const povCharacterId = request.povCharacterId ?? activeBook.settings.povCharacterId;
    const povCharacter = povCharacterId
      ? request.codexEntries.find(entry =>
        entry.id === povCharacterId
        && entry.type === 'character'
        && entry.status === 'active'
        && entry.name.trim().length > 0,
      )
      : undefined;
    const narrativeGuidance = serializeNarrativeGuidance({
      language: activeBook.language,
      proseTense: activeBook.settings.proseTense,
      pointOfView,
      povCharacterName: povCharacter?.name,
      wordCount: request.wordCount,
    });
    const bookContext = serializeBookContext({
      synopsis: activeBook.synopsis,
      synopsisAiContext: activeBook.settings.synopsisAiContext,
      categories: activeBook.categories,
    });

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

    return [
      narrativeGuidance,
      bookContext,
      partialOutline,
      manuscriptContext,
      codexContext,
      vectorContext,
    ].filter(Boolean).join('\n\n');
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
  const contextHierarchy = filterHierarchyForContext(hierarchy);
  const includedSceneIds = new Set(flattenSceneIds(contextHierarchy));
  const includedResults = results.filter((result) => includedSceneIds.has(result.sceneId));
  if (includedResults.length === 0) return '';

  const resultSceneIds = new Set(includedResults.map((result) => result.sceneId));
  const sceneLocations = new Map<string, string>();
  let actDisplayIndex = 0;
  for (const act of contextHierarchy) {
    const visibleChapters = (act.chapters ?? []).filter((chapter) =>
      (chapter.scenes ?? []).some((scene) => resultSceneIds.has(scene.id)),
    );
    if (visibleChapters.length > 0) {
      for (const [chapterIndex, chapter] of visibleChapters.entries()) {
        const visibleScenes = (chapter.scenes ?? []).filter((scene) =>
          resultSceneIds.has(scene.id),
        );
        for (const [sceneIndex, scene] of visibleScenes.entries()) {
          sceneLocations.set(scene.id, [
            formatHierarchyPart('Act', actDisplayIndex, act.title),
            formatHierarchyPart('Chapter', chapterIndex, chapter.title),
            formatHierarchyPart('Scene', sceneIndex, scene.title),
          ].join(' > '));
        }
      }
      actDisplayIndex += 1;
    }
  }

  const heading = '## Semantically Relevant Manuscript Paragraphs';
  let remaining = VECTOR_CONTEXT_CHARACTER_LIMIT
    - heading.length
    - VECTOR_CONTEXT_GUIDANCE.length
    - 4;
  const paragraphs: string[] = [];

  for (const [index, result] of includedResults.entries()) {
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

function flattenSceneIds(hierarchy: readonly ActDto[]): string[] {
  return hierarchy.flatMap((act) => (act.chapters ?? []).flatMap((chapter) =>
    (chapter.scenes ?? []).map((scene) => scene.id),
  ));
}

function formatHierarchyPart(type: string, position: number, title: string): string {
  const normalizedTitle = title.trim();
  return `${type} ${position + 1}${normalizedTitle ? `: ${normalizedTitle}` : ''}`;
}
