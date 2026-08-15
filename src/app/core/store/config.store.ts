import { inject } from '@angular/core';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { LibraryService } from '../../features/library/services/library.service';
import { DropdownOption } from '../../shared/components/autocomplete-dropdown/autocomplete-dropdown.component';

export interface ConfigState {
  languages: DropdownOption[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ConfigState = {
  languages: [],
  isLoading: false,
  error: null,
};

export const ConfigStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withMethods((store, libraryService = inject(LibraryService)) => ({
    async loadLanguages() {
      // Prevent redundant loads
      if (store.languages().length > 0) return;

      patchState(store, { isLoading: true, error: null });

      try {
        const dbLanguages = await libraryService.getLanguages();
        const languages: DropdownOption[] = dbLanguages
          .map(l => ({
            value: l.languageName,
            label: l.languageName.charAt(0).toUpperCase() + l.languageName.slice(1)
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        patchState(store, { languages, isLoading: false });
      } catch (error) {
        patchState(store, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load languages'
        });
      }
    }
  }))
);
