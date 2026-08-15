import { describe, expect, it } from 'vitest';

import {
  buildCodexContextTrie,
  getCodexEntryMatchTerms,
  type CodexContextTrieEntry,
  type CodexContextTrieValue,
} from '../../../../shared/utils/codex-context-trie';
import type { ContextTrie } from '../../../../shared/utils/context-matcher';
import { tokenizeContextTerm } from '../../../../shared/utils/context-tokenizer';

describe('codex context trie', () => {
  it('builds normalized terms from entry names and comma-separated aliases', () => {
    expect(
      getCodexEntryMatchTerms({
        name: '  Mara   Vale ',
        alias: ' The Blade,  Silver Heir ,,MARA VALE ',
      }),
    ).toEqual(['mara vale', 'the blade', 'silver heir']);
  });

  it('stores whole name and alias terms in the trie', () => {
    const trie = buildCodexContextTrie([
      createEntry({
        id: 'codex-1',
        name: 'Mara Vale',
        alias: 'The Blade',
      }),
    ]);

    expect(getTrieEntries(trie, 'mara vale')).toEqual([
      {
        term: 'mara vale',
        value: {
          entryId: 'codex-1',
          trackingSetting: 'include_when_detected',
          status: 'active',
        },
      },
    ]);
    expect(getTrieEntries(trie, 'the blade')).toEqual([
      {
        term: 'the blade',
        value: {
          entryId: 'codex-1',
          trackingSetting: 'include_when_detected',
          status: 'active',
        },
      },
    ]);
    expect(getTrieEntries(trie, 'mara')).toEqual([]);
  });

  it('includes entries regardless of tracking setting', () => {
    const trie = buildCodexContextTrie([
      createEntry({
        id: 'always',
        name: 'Always Included',
        trackingSetting: 'always_include',
      }),
      createEntry({
        id: 'detected',
        name: 'Detected Entry',
        trackingSetting: 'include_when_detected',
      }),
      createEntry({
        id: 'manual',
        name: 'Manual Entry',
        trackingSetting: 'manual',
      }),
      createEntry({
        id: 'never',
        name: 'Never Included',
        trackingSetting: 'never_include',
      }),
    ]);

    expect(getTrieEntryValue(trie, 'always included')?.entryId).toBe('always');
    expect(getTrieEntryValue(trie, 'detected entry')?.entryId).toBe('detected');
    expect(getTrieEntryValue(trie, 'manual entry')?.entryId).toBe('manual');
    expect(getTrieEntryValue(trie, 'never included')?.entryId).toBe('never');
  });

  it('filters archived entries', () => {
    const trie = buildCodexContextTrie([
      createEntry({
        id: 'active',
        name: 'Active Entry',
        status: 'active',
      }),
      createEntry({
        id: 'archived',
        name: 'Archived Entry',
        alias: 'Lost Name',
        status: 'archived',
      }),
    ]);

    expect(getTrieEntryValue(trie, 'active entry')?.entryId).toBe('active');
    expect(getTrieEntries(trie, 'archived entry')).toEqual([]);
    expect(getTrieEntries(trie, 'lost name')).toEqual([]);
  });
});

function createEntry(
  entry: Partial<CodexContextTrieEntry> & Pick<CodexContextTrieEntry, 'id' | 'name'>,
): CodexContextTrieEntry {
  return {
    alias: null,
    trackingSetting: 'include_when_detected',
    status: 'active',
    ...entry,
  };
}

function getTrieEntryValue(
  trie: ContextTrie<CodexContextTrieValue>,
  term: string,
): CodexContextTrieValue | undefined {
  return getTrieEntries(trie, term)[0]?.value;
}

function getTrieEntries(
  trie: ContextTrie<CodexContextTrieValue>,
  term: string,
): { term: string; value: CodexContextTrieValue }[] {
  let node = trie.root;

  for (const token of tokenizeContextTerm(term)) {
    const child = node.children[token];

    if (!child) {
      return [];
    }

    node = child;
  }

  return node.entries;
}
