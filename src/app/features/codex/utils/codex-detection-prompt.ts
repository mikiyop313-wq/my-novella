import type { CodexEntryDto } from '../../../../../shared/models/codex.model';

import {
  buildAiPrompt,
  type BuiltAiPrompt,
} from '../../../shared/utils/ai-prompt-builder';

export interface CodexDetectionPromptOptions {
  prose: string;
  existingEntries: readonly CodexEntryDto[];
}

export function buildCodexDetectionPrompt(options: CodexDetectionPromptOptions): BuiltAiPrompt {
  const existingNamesAndAliases = options.existingEntries.map((entry) => ({
    name: entry.name,
    alias: entry.alias,
  }));

  return buildAiPrompt({
    requestType: 'codexDetection',
    messages: [{
      role: 'user',
      parts: [
        {
          type: 'section',
          name: 'EXISTING CODEX NAMES AND ALIASES',
          content: JSON.stringify(existingNamesAndAliases),
        },
        {
          type: 'section',
          name: 'SCENE PROSE',
          content: options.prose,
        },
      ],
    }],
  });
}
