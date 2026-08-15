import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronService } from '../../../core/services/electron.service';
import { AiStore } from '../../../core/store/ai.store';
import { SystemPromptModelService } from '../system-prompt-model.service';

describe('SystemPromptModelService', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let models: ReturnType<typeof signal<any[]>>;
  let modelProviders: ReturnType<typeof signal<any[]>>;
  let service: SystemPromptModelService;

  beforeEach(() => {
    invoke = vi.fn().mockResolvedValue({
      presetId: 'summary-preset',
      defaultModelId: 'openai/gpt-5',
    });
    models = signal([{
      id: 'openai/gpt-5',
      provider: 'openai',
      source: 'direct',
    }]);
    modelProviders = signal([]);

    TestBed.configureTestingModule({
      providers: [
        SystemPromptModelService,
        { provide: ElectronService, useValue: { invoke } },
        {
          provide: AiStore,
          useValue: {
            models,
            modelProviders,
            ensureModelsLoaded: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
    service = TestBed.inject(SystemPromptModelService);
  });

  it('maps the active preset selector to its generation provider and model ID', async () => {
    await expect(service.resolveActiveModel('book-1', 'summary')).resolves.toEqual({
      status: 'ready',
      selectorId: 'openai/gpt-5',
      provider: 'openai',
      modelId: 'gpt-5',
    });
    expect(invoke).toHaveBeenCalledWith('system-prompts:resolve-active-model', {
      bookId: 'book-1',
      category: 'summary',
    });
  });

  it('identifies an unconfigured OpenRouter default without substituting a model', async () => {
    invoke.mockResolvedValueOnce({
      presetId: 'default-summary',
      defaultModelId: 'deepseek/deepseek-v4-flash',
    });
    models.set([]);
    modelProviders.set([{ id: 'openrouter', state: 'unconfigured', models: [] }]);

    await expect(service.resolveActiveModel('book-1', 'summary')).resolves.toEqual({
      status: 'unavailable',
      selectorId: 'deepseek/deepseek-v4-flash',
      reason: 'openrouter-unconfigured',
    });
  });

  it('reports a removed saved model without falling back', async () => {
    models.set([]);

    await expect(service.resolveActiveModel('book-1', 'summary')).resolves.toEqual({
      status: 'unavailable',
      selectorId: 'openai/gpt-5',
      reason: 'model-unavailable',
    });
  });
});
