import { Injectable, inject } from '@angular/core';

import type {
  ResolvedActiveSystemPromptModelDto,
  SystemPromptCategory,
} from '../../../../shared/models/system-prompt.model';
import { ElectronService } from '../../core/services/electron.service';
import { AiStore } from '../../core/store/ai.store';
import { resolveAiModelTarget, type AiModelTarget } from '../utils/ai-model-selection';

export type SystemPromptModelResolution =
  | ({ status: 'ready'; selectorId: string } & AiModelTarget)
  | {
      status: 'unavailable';
      selectorId: string | null;
      reason: 'missing-model' | 'openrouter-unconfigured' | 'model-unavailable';
    };

@Injectable({ providedIn: 'root' })
export class SystemPromptModelService {
  private readonly electronService = inject(ElectronService);
  private readonly aiStore = inject(AiStore);

  async resolveActiveModel(
    bookId: string,
    category: SystemPromptCategory,
  ): Promise<SystemPromptModelResolution> {
    const resolved = await this.electronService.invoke('system-prompts:resolve-active-model', {
      bookId,
      category,
    }) as ResolvedActiveSystemPromptModelDto;
    const selectorId = resolved.defaultModelId;
    if (!selectorId) {
      return { status: 'unavailable', selectorId: null, reason: 'missing-model' };
    }

    await this.aiStore.ensureModelsLoaded();
    const model = this.aiStore.models().find(candidate => candidate.id === selectorId);
    if (!model) {
      const openRouter = this.aiStore.modelProviders().find(provider => provider.id === 'openrouter');
      const reason = selectorId === 'deepseek/deepseek-v4-flash'
        && openRouter?.state === 'unconfigured'
        ? 'openrouter-unconfigured'
        : 'model-unavailable';
      return { status: 'unavailable', selectorId, reason };
    }

    return { status: 'ready', selectorId, ...resolveAiModelTarget(model) };
  }
}
