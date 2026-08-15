import { Injectable, inject } from '@angular/core';

import type { ChatMessageDetailDto } from '../../../../../shared/models/chat.model';
import type { CodexEntryDetailDto } from '../../../../../shared/models/codex.model';
import type {
  ActDto,
  SceneDto,
  TiptapJsonDoc,
} from '../../../../../shared/models/manuscript.model';
import { ElectronService } from '../../../core/services/electron.service';
import {
  flattenScenes,
  serializeCodexContext,
  serializeFullOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
} from '../../../shared/utils/story-context-builder';
import { CodexService } from '../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';

export interface ChatAiContextRequest {
  userMessage: ChatMessageDetailDto;
  bookId: string;
  bookTitle?: string;
  hierarchy: readonly ActDto[];
}

@Injectable({ providedIn: 'root' })
export class ChatAiContextService {
  private readonly electronService = inject(ElectronService);
  private readonly codexService = inject(CodexService);
  private readonly manuscriptStructureService = inject(ManuscriptStructureService);

  async buildContext(request: ChatAiContextRequest): Promise<string | null> {
    const sceneIds = uniqueStrings(request.userMessage.sceneRefs.map((ref) => ref.sceneId));
    const codexEntryIds = uniqueStrings(
      request.userMessage.codexRefs.map((ref) => ref.codexEntryId),
    );

    if (
      !request.userMessage.includeFullOutline
      && sceneIds.length === 0
      && codexEntryIds.length === 0
    ) {
      return null;
    }

    const [outlineHierarchy, sceneProse, codexDetails] = await Promise.all([
      request.userMessage.includeFullOutline
        ? this.manuscriptStructureService.getOutline(request.bookId)
        : Promise.resolve(null),
      sceneIds.length > 0
        ? this.electronService.invoke('manuscript:getScenesProse', {
            sceneIds,
          }) as Promise<Record<string, TiptapJsonDoc | null>>
        : Promise.resolve({} as Record<string, TiptapJsonDoc | null>),
      Promise.all(codexEntryIds.map((id) => this.codexService.getEntry(id))),
    ]);

    const selectedSceneIds = new Set(sceneIds);
    const proseBySceneId = new Map(
      sceneIds.map((sceneId) => [
        sceneId,
        serializeTiptapDocument(sceneProse[sceneId]),
      ]),
    );
    const manuscriptContext = request.userMessage.includeFullOutline
      ? serializeFullOutline(
          outlineHierarchy ?? [],
          request.bookTitle,
          proseBySceneId,
        )
      : serializeSelectedManuscript(
          request.hierarchy,
          request.bookTitle,
          selectedSceneIds,
          proseBySceneId,
        );
    const progressionSceneId = this.resolveProgressionSceneId(
      request.hierarchy,
      selectedSceneIds,
      request.userMessage.includeFullOutline,
    );
    const codexContext = serializeCodexContext(
      codexDetails.filter(
        (entry): entry is CodexEntryDetailDto => entry !== undefined,
      ),
      request.hierarchy,
      progressionSceneId,
    );
    const content = [
      manuscriptContext,
      codexContext,
    ].filter(Boolean).join('\n\n');

    if (!content) return null;

    return content;
  }

  private resolveProgressionSceneId(
    hierarchy: readonly ActDto[],
    selectedSceneIds: ReadonlySet<string>,
    includeFullOutline: boolean,
  ): string | null {
    const orderedScenes = flattenScenes(hierarchy);
    if (includeFullOutline) return orderedScenes.at(-1)?.id ?? null;

    return [...orderedScenes]
      .reverse()
      .find((scene: SceneDto) => selectedSceneIds.has(scene.id))
      ?.id ?? null;
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
