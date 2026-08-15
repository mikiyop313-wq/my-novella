import type { AiModel } from '../../../../shared/models/ai.model';

export interface AiModelTarget {
  provider: string;
  modelId: string;
}

/** Maps a catalog model to the integration and raw model ID used for generation. */
export function resolveAiModelTarget(model: AiModel): AiModelTarget {
  if (model.source === 'openrouter') {
    return { provider: 'openrouter', modelId: model.id };
  }

  if (!model.provider) {
    throw new Error(`AI model '${model.id}' does not identify its provider.`);
  }

  const separatorIndex = model.id.indexOf('/');
  return {
    provider: model.provider === 'google' ? 'gemini' : model.provider,
    modelId: separatorIndex >= 0 ? model.id.slice(separatorIndex + 1) : model.id,
  };
}
