import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ElectronService } from '../services/electron.service';
import {
  type AiModel,
  type AiModelProviderGroup,
} from '../../../../shared/models/ai.model';

export interface AiState {
  models: AiModel[];
  modelProviders: AiModelProviderGroup[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
}

const initialState: AiState = {
  models: [],
  modelProviders: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
};

export const AiStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, electronService = inject(ElectronService)) => {
    let activeLoad: Promise<void> | null = null;

    const load = (force: boolean): Promise<void> => {
      if (activeLoad) return activeLoad;
      if (!force && store.hasLoaded()) return Promise.resolve();

      patchState(store, {
        models: [],
        modelProviders: [],
        isLoading: true,
        error: null,
      });

      activeLoad = (async () => {
        try {
          const modelProviders = await electronService.invoke(
            'ai:list-models',
          ) as AiModelProviderGroup[];
          patchState(store, {
            models: modelProviders.flatMap((provider) => provider.models),
            modelProviders,
            isLoading: false,
            hasLoaded: true,
          });
        } catch (error) {
          patchState(store, {
            isLoading: false,
            hasLoaded: true,
            error: error instanceof Error ? error.message : 'Failed to load models',
          });
        } finally {
          activeLoad = null;
        }
      })();

      return activeLoad;
    };

    return {
      ensureModelsLoaded: () => load(false),
      refreshModels: () => load(true),
      invalidateModels() {
        patchState(store, {
          models: [],
          modelProviders: [],
          hasLoaded: false,
          error: null,
        });
      },
    };
  }),
);
