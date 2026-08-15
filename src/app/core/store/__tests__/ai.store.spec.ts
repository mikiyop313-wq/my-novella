import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiModelProviderGroup } from '../../../../../shared/models/ai.model';
import { ElectronService } from '../../services/electron.service';
import { AiStore } from '../ai.store';

describe('AiStore model catalog', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let store: InstanceType<typeof AiStore>;

  beforeEach(() => {
    invoke = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        AiStore,
        { provide: ElectronService, useValue: { invoke } },
      ],
    });
    store = TestBed.inject(AiStore);
  });

  it('deduplicates ensure loads and flattens provider models', async () => {
    let resolveCatalog!: (providers: AiModelProviderGroup[]) => void;
    invoke.mockReturnValue(new Promise<AiModelProviderGroup[]>((resolve) => {
      resolveCatalog = resolve;
    }));

    const firstLoad = store.ensureModelsLoaded();
    const duplicateLoad = store.ensureModelsLoaded();
    expect(invoke).toHaveBeenCalledOnce();

    resolveCatalog([readyOpenRouter()]);
    await Promise.all([firstLoad, duplicateLoad]);

    expect(store.models().map((model) => model.id)).toEqual(['anthropic/claude']);
    expect(store.modelProviders()[0].id).toBe('openrouter');
    expect(store.hasLoaded()).toBe(true);

    await store.ensureModelsLoaded();
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('refreshes an already loaded catalog and invalidates it after configuration changes', async () => {
    invoke.mockResolvedValue([readyOpenRouter()]);
    await store.ensureModelsLoaded();
    await store.refreshModels();

    expect(invoke).toHaveBeenCalledTimes(2);

    store.invalidateModels();
    expect(store.models()).toEqual([]);
    expect(store.modelProviders()).toEqual([]);
    expect(store.hasLoaded()).toBe(false);
  });

  it('records a global model-list failure without retrying every ensure call', async () => {
    invoke.mockRejectedValue(new Error('Configuration unavailable'));

    await store.ensureModelsLoaded();
    await store.ensureModelsLoaded();

    expect(invoke).toHaveBeenCalledOnce();
    expect(store.error()).toBe('Configuration unavailable');
    expect(store.hasLoaded()).toBe(true);
  });
});

function readyOpenRouter(): AiModelProviderGroup {
  return {
    id: 'openrouter',
    name: 'OpenRouter',
    state: 'ready',
    models: [{
      id: 'anthropic/claude',
      name: 'Claude',
      provider: 'anthropic',
      providerName: 'OpenRouter: Anthropic',
      source: 'openrouter',
    }],
  };
}
