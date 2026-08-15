import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';

interface CodexEntryMatch {
  value: {
    entryId: string;
  };
}

type FindCodexMatches = (text: string) => readonly CodexEntryMatch[];

const SCENE_NODE = 'sceneSummary';
const STRUCTURAL_BOUNDARY_NODES = new Set(['actHeader', 'chapterHeader']);

/**
 * Finds Codex entries mentioned before a prompt within its current scene.
 * Each ProseMirror text block is matched independently so separate paragraphs
 * cannot accidentally form one multi-word Codex term.
 */
export function findDetectedCodexEntryIdsAbovePrompt(
  doc: ProseMirrorNode,
  promptPos: number,
  findMatches: FindCodexMatches,
): Set<string> {
  let sceneContentStart: number | null = null;

  doc.forEach((node, offset) => {
    if (offset >= promptPos) return;

    if (node.type.name === SCENE_NODE) {
      sceneContentStart = offset + node.nodeSize;
    } else if (STRUCTURAL_BOUNDARY_NODES.has(node.type.name)) {
      sceneContentStart = null;
    }
  });

  const entryIds = new Set<string>();
  if (sceneContentStart === null || sceneContentStart >= promptPos) return entryIds;

  doc.nodesBetween(sceneContentStart, promptPos, node => {
    if (!node.isTextblock) return true;

    for (const match of findMatches(node.textContent)) {
      if (match.value.entryId) entryIds.add(match.value.entryId);
    }

    return false;
  });

  return entryIds;
}

/** Resolves entries already covered by their automatic tracking policy. */
export function getAutomaticallyIncludedCodexEntryIds(
  entries: readonly CodexEntryDto[],
  detectedEntryIds: ReadonlySet<string>,
): Set<string> {
  return new Set(
    entries
      .filter(entry => entry.status === 'active')
      .filter(entry =>
        entry.trackingSetting === 'always_include'
        || (entry.trackingSetting === 'include_when_detected' && detectedEntryIds.has(entry.id)),
      )
      .map(entry => entry.id),
  );
}

/** Removes manually persisted IDs that are now supplied by automatic tracking. */
export function removeAutomaticallyIncludedCodexEntryIds(
  selectedEntryIds: readonly string[],
  automaticallyIncludedEntryIds: ReadonlySet<string>,
): string[] {
  return selectedEntryIds.filter(entryId => !automaticallyIncludedEntryIds.has(entryId));
}
