import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { Editor } from '@tiptap/core';
import { ElectronService } from '../../../core/services/electron.service';
import { ManuscriptMode, ManuscriptModeDto } from '../../../../../shared/models/manuscript.model';
import { inject } from '@angular/core';

export interface FormattingSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textIndent: number;
  pageWidth: 'narrow' | 'medium' | 'wide';
}



export interface ManuscriptState {
  bookId: string | null;
  actId: string | null;
  chapterId: string | null;
  sceneId: string | null;
  mode: ManuscriptMode | null;
  settings: FormattingSettings;
  showFormatMenu: boolean;
  editor: Editor | null;
}

const defaultSettings: FormattingSettings = {
  fontFamily: "'Merriweather', serif",
  fontSize: 18,
  lineHeight: 1.8,
  paragraphSpacing: 24,
  textAlign: 'left',
  textIndent: 0,
  pageWidth: 'medium',
};

const initialState: ManuscriptState = {
  bookId: null,
  actId: null,
  chapterId: null,
  sceneId: null,
  mode: null,
  settings: defaultSettings,
  showFormatMenu: true,
  editor: null,
};

export const ManuscriptStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, electronService = inject(ElectronService)) => ({
    setRouteParams(mode: ManuscriptMode | null, id: string | null) {
      patchState(store, {
        mode,
        bookId: mode === 'book' ? id : null,
        actId: mode === 'act' ? id : null,
        chapterId: mode === 'chapter' ? id : null,
        sceneId: mode === 'scene' ? id : null,
      });

      // Load settings (maybe later data fetching will happen here too)
      this.loadSettings();
    },

    setBookId(id: string | null) {
      // Deprecated in favor of setRouteParams, kept for compatibility if needed elsewhere
      patchState(store, { bookId: id });
      this.loadSettings();
    },

    setEditor(editor: Editor | null) {
      patchState(store, { editor });
    },

    loadSettings() {
      const saved = localStorage.getItem("manuscript_format_global");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Merging parsed settings with defaultSettings ensures that if new settings
          // are introduced to the app in future updates, they will fallback to their
          // default values instead of being undefined when loaded from an older storage format.
          patchState(store, { settings: { ...defaultSettings, ...parsed } });
        } catch (e) {
          console.error('Failed to parse saved formatting settings', e);
        }
      } else {
        patchState(store, { settings: defaultSettings });
      }
    },

    // K is a generic type representing a key of FormattingSettings.
    // FormattingSettings[K] resolves to the specific type corresponding to that key (e.g. number for fontSize).
    // This gives compile-time type safety for key-value pair updates.
    updateSetting<K extends keyof FormattingSettings>(key: K, value: FormattingSettings[K]) {
      const newSettings = { ...store.settings(), [key]: value };
      patchState(store, { settings: newSettings });
      localStorage.setItem("manuscript_format_global", JSON.stringify(newSettings));
    },

    toggleFormatMenu() {
      patchState(store, { showFormatMenu: !store.showFormatMenu() });
    },

    async loadManuscriptData<T extends ManuscriptMode>(mode: T, id: string): Promise<ManuscriptModeDto<T>> {
      const result = await electronService.invoke('manuscript:get', { mode, id });
      return result as ManuscriptModeDto<T>;
    },
  }))
);
