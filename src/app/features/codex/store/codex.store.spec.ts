import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type {
  CodexEntryDetailDto,
  CodexEntryDto,
} from '../../../../../shared/models/codex.model';
import type { CodexEntryMenuPayload } from '../../../../../shared/models/codex-window.model';
import { ToastService } from '../../../shared/services/toast.service';
import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryPersistenceService } from '../services/codex-entry-persistence.service';
import { CodexService } from '../services/codex.service';
import { CodexStore } from './codex.store';

describe('CodexStore', () => {
  let store: InstanceType<typeof CodexStore>;
  let codexService: {
    getEntry: ReturnType<typeof vi.fn>;
    getEntries: ReturnType<typeof vi.fn>;
  };
  let persistenceService: { createEntry: ReturnType<typeof vi.fn> };
  let codexContextTrie: { refreshCurrentContext: ReturnType<typeof vi.fn> };
  let toastService: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    codexService = {
      getEntry: vi.fn(),
      getEntries: vi.fn(),
    };
    persistenceService = { createEntry: vi.fn() };
    codexContextTrie = { refreshCurrentContext: vi.fn() };
    toastService = { error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        CodexStore,
        { provide: CodexService, useValue: codexService },
        { provide: CodexEntryPersistenceService, useValue: persistenceService },
        { provide: CodexContextTrieService, useValue: codexContextTrie },
        { provide: ToastService, useValue: toastService },
      ],
    });

    store = TestBed.inject(CodexStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('refreshes entries and context before closing the create menu on the next frame', async () => {
    const callOrder: string[] = [];
    let frameCallback: FrameRequestCallback | undefined;
    const refreshedEntries = [createEntry({ id: 'codex-2', type: 'location' })];
    persistenceService.createEntry.mockImplementationOnce(async () => {
      callOrder.push('persist');
    });
    codexService.getEntries.mockImplementationOnce(async () => {
      callOrder.push('entries');
      return refreshedEntries;
    });
    codexContextTrie.refreshCurrentContext.mockImplementationOnce(async () => {
      callOrder.push('context');
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callOrder.push('schedule-close');
      frameCallback = callback;
      return 1;
    }));
    store.openCreateMenu('location');

    await store.saveEntry('book-1', createEntryPayload({ type: 'location' }));

    expect(callOrder).toEqual(['persist', 'entries', 'context', 'schedule-close']);
    expect(store.entries()).toEqual(refreshedEntries);
    expect(store.isCreatingEntry()).toBe(true);
    expect(store.isSavingEntry()).toBe(false);

    frameCallback?.(performance.now());

    expect(store.isCreatingEntry()).toBe(false);
  });

  it('closes the create menu immediately when animation frames are unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    persistenceService.createEntry.mockResolvedValueOnce(undefined);
    codexService.getEntries.mockResolvedValueOnce([]);
    codexContextTrie.refreshCurrentContext.mockResolvedValueOnce(undefined);
    store.openCreateMenu('character');

    await store.saveEntry('book-1', createEntryPayload());

    expect(store.isCreatingEntry()).toBe(false);
    expect(store.isSavingEntry()).toBe(false);
  });

  it('keeps the create menu open and clears saving state when creation fails', async () => {
    persistenceService.createEntry.mockRejectedValueOnce(new Error('Create failed'));
    store.openCreateMenu('character');

    await store.saveEntry('book-1', createEntryPayload());

    expect(store.isCreatingEntry()).toBe(true);
    expect(store.isSavingEntry()).toBe(false);
    expect(store.error()).toBe('Create failed');
    expect(toastService.error).toHaveBeenCalledWith('Create failed', 'Codex');
  });

  it('loads and selects an entry by ID', async () => {
    const detail = createEntryDetail({ id: 'codex-2', type: 'location' });
    codexService.getEntry.mockResolvedValueOnce(detail);

    await store.openEntryById('codex-2');

    expect(codexService.getEntry).toHaveBeenCalledWith('codex-2');
    expect(store.activeType()).toBe('location');
    expect(store.selectedEntry()).toEqual(detail);
    expect(store.isCreatingEntry()).toBe(true);
    expect(store.isLoadingSelectedEntry()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('keeps openEntry as an entry-object compatibility wrapper', async () => {
    codexService.getEntry.mockResolvedValueOnce(createEntryDetail({ id: 'codex-3' }));

    await store.openEntry(createEntry({ id: 'codex-3' }));

    expect(codexService.getEntry).toHaveBeenCalledWith('codex-3');
  });

  it('reports a missing entry and restores loading state', async () => {
    codexService.getEntry.mockResolvedValueOnce(null);

    await store.openEntryById('missing-entry');

    expect(store.selectedEntry()).toBeNull();
    expect(store.isLoadingSelectedEntry()).toBe(false);
    expect(store.error()).toBe('Codex entry not found.');
    expect(toastService.error).toHaveBeenCalledWith('Codex entry not found.', 'Codex');
  });

  it('reports loading failures and restores loading state', async () => {
    codexService.getEntry.mockRejectedValueOnce(new Error('Codex unavailable'));

    await store.openEntryById('codex-1');

    expect(store.isLoadingSelectedEntry()).toBe(false);
    expect(store.error()).toBe('Codex unavailable');
    expect(toastService.error).toHaveBeenCalledWith('Codex unavailable', 'Codex');
  });

  it('ignores another entry request while a detail is loading', async () => {
    const pendingDetail = deferred<CodexEntryDetailDto | null>();
    codexService.getEntry.mockReturnValueOnce(pendingDetail.promise);

    const firstRequest = store.openEntryById('codex-1');
    const secondRequest = store.openEntryById('codex-2');

    expect(store.isLoadingSelectedEntry()).toBe(true);
    expect(codexService.getEntry).toHaveBeenCalledTimes(1);
    expect(codexService.getEntry).toHaveBeenCalledWith('codex-1');

    pendingDetail.resolve(createEntryDetail({ id: 'codex-1' }));
    await Promise.all([firstRequest, secondRequest]);

    expect(store.selectedEntry()?.id).toBe('codex-1');
    expect(store.isLoadingSelectedEntry()).toBe(false);
  });

  it('does not apply a detail response after the menu state invalidates it', async () => {
    const pendingDetail = deferred<CodexEntryDetailDto | null>();
    codexService.getEntry.mockReturnValueOnce(pendingDetail.promise);

    const request = store.openEntryById('codex-1');
    store.openCreateMenu('location');

    pendingDetail.resolve(createEntryDetail({ id: 'codex-1', type: 'character' }));
    await request;

    expect(store.activeType()).toBe('location');
    expect(store.selectedEntry()).toBeNull();
    expect(store.isCreatingEntry()).toBe(true);
    expect(store.isLoadingSelectedEntry()).toBe(false);
  });
});

function createEntry(overrides: Partial<CodexEntryDto> = {}): CodexEntryDto {
  return {
    id: 'codex-1',
    bookId: 'book-1',
    type: 'character',
    name: 'Mara Vale',
    alias: null,
    description: null,
    image: null,
    status: 'active',
    trackingSetting: 'include_when_detected',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createEntryDetail(
  overrides: Partial<CodexEntryDetailDto> = {},
): CodexEntryDetailDto {
  return {
    ...createEntry(overrides),
    entryNotes: [],
    entryProgression: [],
    ...overrides,
  };
}

function createEntryPayload(
  overrides: Partial<CodexEntryMenuPayload> = {},
): CodexEntryMenuPayload {
  return {
    type: 'character',
    name: 'Mara Vale',
    alias: '',
    description: '',
    trackingSetting: 'include_when_detected',
    notes: [],
    progression: [],
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
