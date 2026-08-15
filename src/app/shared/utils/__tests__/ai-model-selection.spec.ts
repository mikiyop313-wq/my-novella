import { describe, expect, it } from 'vitest';

import type { AiModel } from '../../../../../shared/models/ai.model';
import { resolveAiModelTarget } from '../ai-model-selection';

describe('resolveAiModelTarget', () => {
  it.each([
    [model('vendor/model', 'vendor', 'openrouter'), 'openrouter', 'vendor/model'],
    [model('gemini/gemini-pro', 'google', 'direct'), 'gemini', 'gemini-pro'],
    [model('openai/gpt-5', 'openai', 'direct'), 'openai', 'gpt-5'],
    [model('anthropic/claude', 'anthropic', 'direct'), 'anthropic', 'claude'],
    [model('ollama/library/model:tag', 'ollama', 'local'), 'ollama', 'library/model:tag'],
    [model('lm-studio/team/model', 'lm-studio', 'local'), 'lm-studio', 'team/model'],
  ])('maps %s to %s using model ID %s', (catalogModel, provider, modelId) => {
    expect(resolveAiModelTarget(catalogModel)).toEqual({ provider, modelId });
  });
});

function model(id: string, provider: string, source: AiModel['source']): AiModel {
  return { id, name: id, provider, source };
}
