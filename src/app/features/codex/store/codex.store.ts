import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { ToastService } from '../../../shared/services/toast.service';
import {
  type CodexEntryDetailDto,
  type CodexEntryDto,
  type CodexEntryListFiltersDto,
  type CodexEntryType,
  type CodexTrackingSetting,
} from '../../../../../shared/models/codex.model';
import { type CodexEntryMenuPayload } from '../../../../../shared/models/codex-window.model';
import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryPersistenceService } from '../services/codex-entry-persistence.service';
import { CodexService } from '../services/codex.service';

export interface CodexState {
  activeType: CodexEntryType;
  searchQuery: string;
  entryFilters: CodexEntryListFiltersDto;
  entries: CodexEntryDto[];
  selectedEntry: CodexEntryDetailDto | null;
  isLoadingEntries: boolean;
  isLoadingSelectedEntry: boolean;
  isCreatingEntry: boolean;
  isSavingEntry: boolean;
  error: string | null;
}

const initialState: CodexState = {
  activeType: 'character',
  searchQuery: '',
  entryFilters: {},
  entries: [],
  selectedEntry: null,
  isLoadingEntries: false,
  isLoadingSelectedEntry: false,
  isCreatingEntry: false,
  isSavingEntry: false,
  error: null,
};

export const CodexStore = signalStore(
  { providedIn: 'root' },

  withState(initialState),

  withMethods((
    store,
    codexService = inject(CodexService),
    persistenceService = inject(CodexEntryPersistenceService),
    codexContextTrie = inject(CodexContextTrieService),
    toastService = inject(ToastService),
  ) => {
    let loadRequestId = 0;
    let detailRequestId = 0;
    let pendingEntrySave: { bookId: string | null; entryData: CodexEntryMenuPayload } | null = null;

    function setBookRequiredError(action: string): void {
      const message = `Open a book before ${action} a codex entry.`;
      patchState(store, { error: message });
      toastService.error(message, 'Codex');
    }

    async function loadEntries(
      bookId: string | null,
      type: CodexEntryType,
      query: string,
      filters: CodexEntryListFiltersDto = store.entryFilters(),
    ): Promise<void> {
      const requestId = ++loadRequestId;

      if (!bookId) {
        patchState(store, {
          entries: [],
          isLoadingEntries: false,
          error: null,
        });
        return;
      }

      patchState(store, {
        isLoadingEntries: true,
        error: null,
      });

      try {
        const entries = await codexService.getEntries(bookId, {
          ...filters,
          type,
          search: query || undefined,
        });

        if (requestId !== loadRequestId) return;

        patchState(store, { entries });
      } catch (error) {
        if (requestId !== loadRequestId) return;

        const message = error instanceof Error ? error.message : 'Failed to load codex entries.';
        patchState(store, {
          entries: [],
          error: message,
        });
        toastService.error(message, 'Codex');
      } finally {
        if (requestId === loadRequestId) {
          patchState(store, { isLoadingEntries: false });
        }
      }
    }

    async function createEntry(bookId: string | null, entryData: CodexEntryMenuPayload): Promise<void> {
      if (!bookId) {
        setBookRequiredError('creating');
        return;
      }

      try {
        patchState(store, { isSavingEntry: true });

        await persistenceService.createEntry(bookId, entryData);

        patchState(store, { activeType: entryData.type });
        await loadEntries(bookId, entryData.type, store.searchQuery().trim());
        await codexContextTrie.refreshCurrentContext();
        closeCreateMenu();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create codex entry.';
        patchState(store, { error: message });
        toastService.error(message, 'Codex');
      } finally {
        patchState(store, { isSavingEntry: false });
      }
    }

    async function updateEntry(bookId: string | null, entryData: CodexEntryMenuPayload): Promise<void> {
      const selectedEntry = store.selectedEntry();
      if (!selectedEntry) return;

      if (!bookId) {
        setBookRequiredError('updating');
        return;
      }

      try {
        patchState(store, { isSavingEntry: true });

        const refreshedEntry = await persistenceService.updateEntry(selectedEntry, entryData);
        if (refreshedEntry && store.selectedEntry()?.id === selectedEntry.id) {
          patchState(store, { selectedEntry: refreshedEntry });
        }

        patchState(store, { activeType: entryData.type });
        await loadEntries(bookId, entryData.type, store.searchQuery().trim());
        await codexContextTrie.refreshCurrentContext();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update codex entry.';
        patchState(store, { error: message });
        toastService.error(message, 'Codex');
      } finally {
        patchState(store, { isSavingEntry: false });
      }
    }

    function closeCreateMenu(): void {
      detailRequestId++;
      patchState(store, {
        isCreatingEntry: false,
        selectedEntry: null,
        isLoadingSelectedEntry: false,
      });
    }

    async function openEntryById(entryId: string): Promise<void> {
      if (store.isLoadingSelectedEntry()) return;

      const requestId = ++detailRequestId;

      try {
        patchState(store, {
          isLoadingSelectedEntry: true,
          error: null,
        });

        const detail = await codexService.getEntry(entryId);

        if (requestId !== detailRequestId) return;

        if (!detail) {
          throw new Error('Codex entry not found.');
        }

        const typeChanged = store.activeType() !== detail.type;
        patchState(store, {
          activeType: detail.type,
          selectedEntry: detail,
          isCreatingEntry: true,
          ...(typeChanged ? { entries: [], isLoadingEntries: true } : {})
        });
      } catch (error) {
        if (requestId !== detailRequestId) return;

        const message = error instanceof Error ? error.message : 'Failed to load codex entry.';
        patchState(store, { error: message });
        toastService.error(message, 'Codex');
      } finally {
        if (requestId === detailRequestId) {
          patchState(store, { isLoadingSelectedEntry: false });
        }
      }
    }

    return {
      setActiveType(type: CodexEntryType): void {
        if (store.activeType() !== type) {
          patchState(store, { activeType: type, entries: [], isLoadingEntries: true });
        }
      },

      setSearchQuery(searchQuery: string): void {
        patchState(store, { searchQuery });
      },

      setEntryFilters(entryFilters: CodexEntryListFiltersDto): void {
        patchState(store, { entryFilters });
      },

      openCreateMenu(type: CodexEntryType): void {
        detailRequestId++;
        const typeChanged = store.activeType() !== type;
        patchState(store, {
          activeType: type,
          selectedEntry: null,
          isCreatingEntry: true,
          isLoadingSelectedEntry: false,
          error: null,
          ...(typeChanged ? { entries: [], isLoadingEntries: true } : {})
        });
      },

      closeCreateMenu,

      openEntryById,

      openEntry(entry: CodexEntryDto): Promise<void> {
        return openEntryById(entry.id);
      },

      async saveEntry(bookId: string | null, entryData: CodexEntryMenuPayload): Promise<void> {
        if (store.isSavingEntry()) {
          pendingEntrySave = { bookId, entryData };
          return;
        }

        let nextSave: { bookId: string | null; entryData: CodexEntryMenuPayload } | null = { bookId, entryData };
        while (nextSave) {
          if (store.selectedEntry()) {
            await updateEntry(nextSave.bookId, nextSave.entryData);
          } else {
            await createEntry(nextSave.bookId, nextSave.entryData);
          }

          nextSave = pendingEntrySave;
          pendingEntrySave = null;
        }
      },

      async archiveEntry(bookId: string | null): Promise<void> {
        const selectedEntry = store.selectedEntry();
        if (!selectedEntry || store.isSavingEntry()) return;

        if (!bookId) {
          setBookRequiredError('archiving');
          return;
        }

        try {
          patchState(store, { isSavingEntry: true });

          await persistenceService.archiveEntry(selectedEntry);

          await loadEntries(bookId, selectedEntry.type, store.searchQuery().trim());
          await codexContextTrie.refreshCurrentContext();
          closeCreateMenu();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to archive codex entry.';
          patchState(store, { error: message });
          toastService.error(message, 'Codex');
        } finally {
          patchState(store, { isSavingEntry: false });
        }
      },

      async restoreEntry(bookId: string | null): Promise<void> {
        const selectedEntry = store.selectedEntry();
        if (!selectedEntry || store.isSavingEntry()) return;

        if (!bookId) {
          setBookRequiredError('restoring');
          return;
        }

        try {
          patchState(store, { isSavingEntry: true });

          await persistenceService.restoreEntry(selectedEntry);

          await loadEntries(bookId, selectedEntry.type, store.searchQuery().trim());
          await codexContextTrie.refreshCurrentContext();
          closeCreateMenu();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to restore codex entry.';
          patchState(store, { error: message });
          toastService.error(message, 'Codex');
        } finally {
          patchState(store, { isSavingEntry: false });
        }
      },

      async deleteEntry(bookId: string | null): Promise<void> {
        const selectedEntry = store.selectedEntry();
        if (!selectedEntry || store.isSavingEntry()) return;

        if (!bookId) {
          setBookRequiredError('deleting');
          return;
        }

        try {
          patchState(store, { isSavingEntry: true });

          await persistenceService.deleteEntry(selectedEntry);

          await loadEntries(bookId, selectedEntry.type, store.searchQuery().trim());
          await codexContextTrie.refreshCurrentContext();
          closeCreateMenu();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to delete codex entry.';
          patchState(store, { error: message });
          toastService.error(message, 'Codex');
        } finally {
          patchState(store, { isSavingEntry: false });
        }
      },

      loadEntries,
    };
  }),
);
