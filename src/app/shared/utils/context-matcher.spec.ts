import { describe, expect, it } from 'vitest';

import {
  createContextMatcher,
  findContextMatches,
  hasContextMatch,
  type ContextTrie,
  type ContextTrieNode,
} from '../../../../shared/utils/context-matcher';
import { tokenizeContextTerm } from '../../../../shared/utils/context-tokenizer';

describe('context matcher data structure', () => {
  it('stores context entries in trie nodes', () => {
    const trie: ContextTrie<string> = {
      root: {
        children: {
          mara: {
            children: {},
            entries: [{ term: 'mara', value: 'character' }],
          },
        },
        entries: [],
      },
    };

    expect(trie.root.children['mara'].entries).toEqual([
      { term: 'mara', value: 'character' },
    ]);
  });
});

describe('findContextMatches', () => {
  it('returns highlight-ready ranges for matched terms', () => {
    const trie = createTrie([
      { term: 'mara vale', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'The room sees Mara Vale arrive.')).toEqual([
      {
        term: 'mara vale',
        value: 'character',
        startIndex: 14,
        endIndex: 23,
        text: 'Mara Vale',
      },
    ]);
  });

  it('matches phrase terms across punctuation separators', () => {
    const trie = createTrie([
      { term: 'mara vale', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'Mara-Vale arrives.')).toEqual([
      {
        term: 'mara vale',
        value: 'character',
        startIndex: 0,
        endIndex: 9,
        text: 'Mara-Vale',
      },
    ]);
  });

  it('matches case-insensitively while preserving original text', () => {
    const trie = createTrie([
      { term: 'mara', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'MARA waits.')).toEqual([
      {
        term: 'mara',
        value: 'character',
        startIndex: 0,
        endIndex: 4,
        text: 'MARA',
      },
    ]);
  });

  it('returns no matches when no keyword exists', () => {
    const trie = createTrie([
      { term: 'mara', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'The gate opens.')).toEqual([]);
  });

  it('matches at punctuation boundaries', () => {
    const trie = createTrie([
      { term: 'mara', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'Wait... Mara!')).toEqual([
      {
        term: 'mara',
        value: 'character',
        startIndex: 8,
        endIndex: 12,
        text: 'Mara',
      },
    ]);
  });

  it('does not match terms embedded inside larger words', () => {
    const trie = createTrie([
      { term: 'mara', value: 'character' },
    ]);

    expect(findContextMatches(trie, 'The Marauder found Samara.')).toEqual([]);
  });

  it('returns Aho-Corasick suffix matches in input order', () => {
    const trie = createTrie([
      { term: 'silver key', value: 'artifact' },
      { term: 'key', value: 'object' },
    ]);

    expect(findContextMatches(trie, 'Mara found the silver key.')).toEqual([
      {
        term: 'silver key',
        value: 'artifact',
        startIndex: 15,
        endIndex: 25,
        text: 'silver key',
      },
      {
        term: 'key',
        value: 'object',
        startIndex: 22,
        endIndex: 25,
        text: 'key',
      },
    ]);
  });
});

describe('hasContextMatch', () => {
  it('returns true when any keyword exists in the text', () => {
    const trie = createTrie([
      { term: 'silver key', value: 'object' },
    ]);

    expect(hasContextMatch(trie, 'Mara found the Silver Key.')).toBe(true);
  });

  it('returns false when no keyword exists in the text', () => {
    const trie = createTrie([
      { term: 'silver key', value: 'object' },
    ]);

    expect(hasContextMatch(trie, 'Mara found the door.')).toBe(false);
  });
});

describe('createContextMatcher', () => {
  it('returns the same matches as the compatibility wrapper', () => {
    const trie = createTrie([
      { term: 'mara vale', value: 'character' },
      { term: 'silver key', value: 'artifact' },
      { term: 'key', value: 'object' },
    ]);
    const matcher = createContextMatcher(trie);
    const text = 'Mara Vale found the silver key.';

    expect(matcher.findMatches(text)).toEqual(findContextMatches(trie, text));
  });

  it('checks whether any keyword exists without changing match behavior', () => {
    const trie = createTrie([
      { term: 'silver key', value: 'object' },
    ]);
    const matcher = createContextMatcher(trie);

    expect(matcher.hasMatch('Mara found the Silver Key.')).toBe(true);
    expect(matcher.hasMatch('Mara found the door.')).toBe(false);
  });
});

function createTrie<TValue>(
  entries: Array<{ term: string; value: TValue }>,
): ContextTrie<TValue> {
  const root = createNode<TValue>();

  for (const entry of entries) {
    let node = root;

    for (const token of tokenizeContextTerm(entry.term)) {
      node.children[token] ??= createNode<TValue>();
      node = node.children[token];
    }

    node.entries.push(entry);
  }

  return { root };
}

function createNode<TValue>(): ContextTrieNode<TValue> {
  return {
    children: {},
    entries: [],
  };
}
