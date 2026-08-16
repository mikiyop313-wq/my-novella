import { describe, expect, it } from 'vitest';

import type { SystemPromptPresetRow } from '../../schema';
import { mapSystemPromptPresetRow } from '../system-prompt.mapper';

describe('system prompt mapper', () => {
  it('maps required timestamps to ISO strings', () => {
    const preset = mapSystemPromptPresetRow(presetRow({
      createdAt: 1,
      lastEditedAt: 2,
    }));

    expect(preset.createdAt).toBe('1970-01-01T00:00:01.000Z');
    expect(preset.lastEditedAt).toBe('1970-01-01T00:00:02.000Z');
  });

  it('retains the required timestamp failure behavior', () => {
    const invalid = { ...presetRow(), createdAt: null } as unknown as SystemPromptPresetRow;

    expect(() => mapSystemPromptPresetRow(invalid)).toThrow();
  });
});

function presetRow(overrides: Partial<SystemPromptPresetRow> = {}): SystemPromptPresetRow {
  return {
    id: 'preset-1',
    name: 'Preset',
    systemPrompt: 'Instructions',
    category: 'chat',
    scope: 'global',
    bookId: null,
    temperature: 0.5,
    topP: 1,
    maxOutputTokens: null,
    presencePenalty: 0,
    frequencyPenalty: 0,
    defaultModelId: null,
    createdAt: 1,
    lastEditedAt: 1,
    ...overrides,
  };
}
