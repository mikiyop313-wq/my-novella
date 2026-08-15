import type { CodexEntryDto } from '../../../../../shared/models/codex.model';

import { buildPromptSection } from '../../../shared/utils/ai-prompt-builder';

export interface CodexDetectionPromptOptions {
  prose: string;
  existingEntries: readonly CodexEntryDto[];
}

export function buildCodexDetectionPrompt(options: CodexDetectionPromptOptions): string {
  const existingNamesAndAliases = options.existingEntries.map((entry) => ({
    name: entry.name,
    alias: entry.alias,
  }));

  return [
    buildPromptSection({
      name: 'EXISTING CODEX NAMES AND ALIASES',
      content: JSON.stringify(existingNamesAndAliases),
    }),
    buildPromptSection({
      name: 'SCENE PROSE',
      content: options.prose,
    }),
  ].join('\n\n');
}
