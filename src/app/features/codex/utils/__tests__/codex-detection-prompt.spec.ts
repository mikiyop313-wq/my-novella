import type { CodexEntryDto } from '../../../../../../shared/models/codex.model';

import { buildCodexDetectionPrompt } from '../codex-detection-prompt';

describe('Codex detection prompt', () => {
  it('includes existing names and aliases before the scene prose', () => {
    const existingEntries = [
      {
        id: 'entry-1',
        bookId: 'book-1',
        name: 'Elara Voss',
        alias: 'Elara',
        type: 'character',
        description: 'A cartographer.',
        image: null,
        status: 'active',
        trackingSetting: 'manual',
        createdAt: '2026-08-09T00:00:00.000Z',
        lastEditedAt: '2026-08-09T00:00:00.000Z',
      },
    ] satisfies CodexEntryDto[];

    expect(buildCodexDetectionPrompt({
      prose: 'Elara entered the harbor.',
      existingEntries,
    })).toBe([
      '--- BEGIN EXISTING CODEX NAMES AND ALIASES ---',
      '[{"name":"Elara Voss","alias":"Elara"}]',
      '--- END EXISTING CODEX NAMES AND ALIASES ---',
      '--- BEGIN SCENE PROSE ---',
      'Elara entered the harbor.',
      '--- END SCENE PROSE ---',
    ].join('\n\n'));
  });
});
