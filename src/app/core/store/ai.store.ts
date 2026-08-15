import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ElectronService } from '../services/electron.service';
import { type AiModel } from '../../../../shared/models/ai.model';

export interface AiState {
  models: AiModel[];
  isLoading: boolean;
  error: string | null;
}

const initialState: AiState = {
  models: [],
  isLoading: false,
  error: null,
};

export const AiStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, electronService = inject(ElectronService)) => ({
    async loadModels() {
      // Prevent redundant loads
      if (store.models().length > 0 || store.isLoading()) return;

      patchState(store, { isLoading: true, error: null });

      try {
        const models = await electronService.invoke('ai:list-models') as AiModel[];
        patchState(store, { models, isLoading: false });
      } catch (error) {
        patchState(store, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load models',
        });
      }
    },
  })),
);
