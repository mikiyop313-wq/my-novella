import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import type { CodexEntryDto } from '../../../../../shared/models/codex.model';
import { tokenizeContextTerm } from '../../../../../shared/utils/context-tokenizer';
import { CodexContextTrieService } from './codex-context-trie.service';
import { CodexService } from './codex.service';

describe('CodexContextTrieService', () => {
  it('loads active Codex entries and builds a trie for the context', async () => {
    const entries = [
      createEntry({
        id: 'codex-1',
        name: 'Mara Vale',
        alias: 'The Blade',
        trackingSetting: 'manual',
      }),
    ];
    const codexService = createCodexService(entries);
    const service = createService(codexService);

    await service.loadForContext('book-1');

    expect(codexService.getEntries).toHaveBeenCalledWith('book-1', { status: 'active' });
    expect(service.contextId()).toBe('book-1');
    expect(service.entries()).toEqual(entries);
    expect(getTrieEntryValue(service.trie(), 'mara vale')).toEqual({
      entryId: 'codex-1',
      trackingSetting: 'manual',
      status: 'active',
    });
    expect(getTrieEntryValue(service.trie(), 'the blade')?.entryId).toBe('codex-1');
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('resets trie state when no context is active', async () => {
    const service = createService(createCodexService([]));

    await service.loadForContext(null);

    expect(service.contextId()).toBeNull();
    expect(service.entries()).toEqual([]);
    expect(service.trie()).toBeNull();
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('refreshes the currently loaded context', async () => {
    const firstEntries = [
      createEntry({
        id: 'codex-1',
        name: 'Mara Vale',
      }),
    ];
    const secondEntries = [
      createEntry({
        id: 'codex-2',
        name: 'Silver Key',
      }),
    ];
    const codexService = {
      getEntries: vi
        .fn()
        .mockResolvedValueOnce(firstEntries)
        .mockResolvedValueOnce(secondEntries),
    };
    const service = createService(codexService);

    await service.loadForContext('book-1');
    await service.refreshCurrentContext();

    expect(codexService.getEntries).toHaveBeenCalledTimes(2);
    expect(codexService.getEntries).toHaveBeenLastCalledWith('book-1', { status: 'active' });
    expect(service.contextId()).toBe('book-1');
    expect(getTrieEntryValue(service.trie(), 'mara vale')).toBeUndefined();
    expect(getTrieEntryValue(service.trie(), 'silver key')?.entryId).toBe('codex-2');
  });

  it('clears trie state when refreshing without an active context', async () => {
    const service = createService(createCodexService([]));

    await service.refreshCurrentContext();

    expect(service.contextId()).toBeNull();
    expect(service.entries()).toEqual([]);
    expect(service.trie()).toBeNull();
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('clears trie state and stores an error when loading fails', async () => {
    const codexService = {
      getEntries: vi.fn(async () => {
        throw new Error('Codex unavailable');
      }),
    };
    const service = createService(codexService);

    await service.loadForContext('book-1');

    expect(service.entries()).toEqual([]);
    expect(service.trie()).toBeNull();
    expect(service.isLoading()).toBe(false);
    expect(service.error()).toBe('Codex unavailable');
  });
});

function createService(codexService: { getEntries: ReturnType<typeof vi.fn> }): CodexContextTrieService {
  TestBed.configureTestingModule({
    providers: [
      CodexContextTrieService,
      { provide: CodexService, useValue: codexService },
    ],
  });

  return TestBed.inject(CodexContextTrieService);
}

function createCodexService(entries: CodexEntryDto[]): { getEntries: ReturnType<typeof vi.fn> } {
  return {
    getEntries: vi.fn(async () => entries),
  };
}

function createEntry(overrides: Partial<CodexEntryDto>): CodexEntryDto {
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

function getTrieEntryValue(
  trie: ReturnType<CodexContextTrieService['trie']>,
  term: string,
) {
  if (!trie) return undefined;

  let node = trie.root;

  for (const token of tokenizeContextTerm(term)) {
    const child = node.children[token];

    if (!child) {
      return undefined;
    }

    node = child;
  }

  return node.entries[0]?.value;
}
