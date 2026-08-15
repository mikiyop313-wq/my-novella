import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import type {
  CodexEntryDetailDto,
  CodexEntryDto,
} from '../../../../../shared/models/codex.model';
import { ToastService } from '../../../shared/services/toast.service';
import { CodexContextTrieService } from '../services/codex-context-trie.service';
import { CodexEntryPersistenceService } from '../services/codex-entry-persistence.service';
import { CodexService } from '../services/codex.service';
import { CodexStore } from './codex.store';

describe('CodexStore entry opening', () => {
  let store: InstanceType<typeof CodexStore>;
  let codexService: { getEntry: ReturnType<typeof vi.fn> };
  let toastService: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    codexService = { getEntry: vi.fn() };
    toastService = { error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        CodexStore,
        { provide: CodexService, useValue: codexService },
        { provide: CodexEntryPersistenceService, useValue: {} },
        { provide: CodexContextTrieService, useValue: {} },
        { provide: ToastService, useValue: toastService },
      ],
    });

    store = TestBed.inject(CodexStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
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
