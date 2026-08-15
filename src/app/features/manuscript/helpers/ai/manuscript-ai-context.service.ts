import { Injectable, inject } from '@angular/core';
import type { Editor } from '@tiptap/core';

import type { AiChatMessage } from '../../../../core/services/ai-state.service';
import { ElectronService } from '../../../../core/services/electron.service';
import { CodexService } from '../../../codex/services/codex.service';
import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';
import type {
  ActDto,
  SceneDto,
  TiptapJsonDoc,
} from '../../../../../../shared/models/manuscript.model';
import type { AiManuscriptContextRef } from '../../components/ai-prompt/ai-prompt-dropdown-options';
import { extractManuscriptHierarchyById } from '../content/manuscript-content.utils';
import { ManuscriptProseSaverService } from '../saving/manuscript-prose-saver.service';
import {
  type AutomaticSceneContent,
  expandManuscriptRefs,
  findCurrentSceneIdBeforePosition,
  findPreviousSceneId,
  serializeAutomaticManuscript,
  serializeCodexContext,
  serializeFullOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
} from './ai-prompt-context-builder';

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
}

@Injectable({ providedIn: 'root' })
export class ManuscriptAiContextService {
  private readonly electronService = inject(ElectronService);
  private readonly codexService = inject(CodexService);
  private readonly saver = inject(ManuscriptProseSaverService);

  async buildMessages(request: ManuscriptAiContextRequest): Promise<AiChatMessage[]> {
    if (!request.bookId) throw new Error('No active book is available for AI context.');

    const editorDoc = request.editor.state.doc;
    const currentSceneId = findCurrentSceneIdBeforePosition(editorDoc, request.promptPos);
    const currentSceneHierarchy = currentSceneId
      ? extractManuscriptHierarchyById(request.editor, currentSceneId, request.promptId)
      : null;
    const currentScene = currentSceneId
      ? findSceneById(currentSceneHierarchy, currentSceneId)
      : null;
    const currentProseBeforePrompt = serializeTiptapDocument(currentScene?.prose);
    const selectedSceneIds = expandManuscriptRefs(request.hierarchy, request.manuscriptRefs);
    const usesAutomaticFallback = !request.includeFullOutline && request.manuscriptRefs.length === 0;
    const previousSceneId = usesAutomaticFallback && currentSceneId
      ? findPreviousSceneId(request.hierarchy, currentSceneId)
      : null;
    const proseSceneIds = new Set(selectedSceneIds);
    if (previousSceneId) proseSceneIds.add(previousSceneId);

    const proseBySceneId = new Map<string, string>();
    const unloadedSceneIds: string[] = [];
    for (const sceneId of proseSceneIds) {
      const extractedHierarchy = extractManuscriptHierarchyById(request.editor, sceneId);
      const extractedScene = findSceneById(extractedHierarchy, sceneId);
      if (!extractedScene || extractedScene.prose === null) unloadedSceneIds.push(sceneId);
      else proseBySceneId.set(sceneId, serializeTiptapDocument(extractedScene.prose));
    }

    if (unloadedSceneIds.length > 0) await this.saver.flushDirtySections();

    const [outlineHierarchy, databaseProse] = await Promise.all([
      request.includeFullOutline
        ? this.electronService.invoke('manuscript:getOutline', { bookId: request.bookId }) as Promise<ActDto[]>
        : Promise.resolve(null),
      unloadedSceneIds.length > 0
        ? this.electronService.invoke('manuscript:getScenesProse', { sceneIds: unloadedSceneIds }) as Promise<Record<string, TiptapJsonDoc | null>>
        : Promise.resolve({} as Record<string, TiptapJsonDoc | null>),
    ]);

    for (const sceneId of unloadedSceneIds) {
      proseBySceneId.set(sceneId, serializeTiptapDocument(databaseProse[sceneId]));
    }

    const manuscriptContext = request.includeFullOutline
      ? serializeFullOutline(outlineHierarchy ?? [], request.bookTitle, proseForScenes(proseBySceneId, selectedSceneIds))
      : request.manuscriptRefs.length > 0
        ? serializeSelectedManuscript(
          request.hierarchy,
          request.bookTitle,
          request.manuscriptRefs,
          selectedSceneIds,
          proseForScenes(proseBySceneId, selectedSceneIds),
        )
        : this.buildAutomaticContext(
          request.hierarchy,
          currentSceneId,
          currentProseBeforePrompt,
          previousSceneId,
          proseBySceneId,
        );

    const codexEntryIds = this.resolveCodexEntryIds(request);
    const codexDetails = (await Promise.all(codexEntryIds.map(id => this.codexService.getEntry(id))))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      .filter(entry => entry.status === 'active' && entry.trackingSetting !== 'never_include');
    const codexContext = serializeCodexContext(
      codexDetails,
      request.hierarchy,
      currentSceneId,
    );

    const messages: AiChatMessage[] = [];
    if (manuscriptContext || codexContext) {
      messages.push({
        role: 'user',
        content: [
          '--- BEGIN STORY CONTEXT ---',
          manuscriptContext,
          codexContext,
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
      label: 'Prose before AI prompt',
      text: currentProseBeforePrompt,
    });
    return serializeAutomaticManuscript(hierarchy, sceneContent);
  }

  private resolveCodexEntryIds(request: ManuscriptAiContextRequest): string[] {
    const cachedEntries = new Map(request.codexEntries.map(entry => [entry.id, entry]));
    const includedIds = new Set([
      ...request.manualCodexEntryIds,
      ...request.automaticCodexEntryIds,
    ]);

    return [...includedIds].filter(id => {
      const entry = cachedEntries.get(id);
      return entry?.status === 'active' && entry.trackingSetting !== 'never_include';
    });
  }
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
