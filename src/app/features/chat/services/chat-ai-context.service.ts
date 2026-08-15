import { Injectable, inject } from '@angular/core';

import type { CodexEntryDetailDto } from '../../../../../shared/models/codex.model';
import type {
  ActDto,
  SceneDto,
  TiptapJsonDoc,
} from '../../../../../shared/models/manuscript.model';
import { ElectronService } from '../../../core/services/electron.service';
import {
  type BookContext,
  flattenScenes,
  serializeBookContext,
  serializeCodexContext,
  serializeFullOutline,
  serializeSelectedManuscript,
  serializeTiptapDocument,
} from '../../../shared/utils/story-context-builder';
import { CodexService } from '../../codex/services/codex.service';
import { ManuscriptStructureService } from '../../workspace/services/manuscript-structure.service';
import { filterHierarchyForContext } from '../../../../../shared/utils/manuscript-context-inclusion';

export interface ChatAiContextRequest {
  includeBookMetadata: boolean;
  bookContext?: BookContext;
  includeFullOutline: boolean;
  sceneIds: readonly string[];
  codexEntryIds: readonly string[];
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
    const sceneIds = uniqueStrings(request.sceneIds);
    const codexEntryIds = uniqueStrings(request.codexEntryIds);
    const bookContext = request.includeBookMetadata && request.bookContext
      ? serializeBookContext(request.bookContext)
      : '';

    if (
      !bookContext
      && !request.includeFullOutline
      && sceneIds.length === 0
      && codexEntryIds.length === 0
    ) {
      return null;
    }

    const [outlineHierarchy, sceneProse, codexDetails] = await Promise.all([
      request.includeFullOutline
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
    const manuscriptContext = request.includeFullOutline
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
      request.includeFullOutline,
    );
    const codexContext = serializeCodexContext(
      codexDetails.filter(
        (entry): entry is CodexEntryDetailDto => entry !== undefined,
      ),
      request.hierarchy,
      progressionSceneId,
    );
    const content = [
      bookContext,
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
    const orderedScenes = flattenScenes(filterHierarchyForContext(hierarchy));
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
