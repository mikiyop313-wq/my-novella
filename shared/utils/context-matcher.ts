import { tokenizeContextTerm } from './context-tokenizer';

export interface ContextTrie<TValue = unknown> {
  root: ContextTrieNode<TValue>;
}

export interface ContextTrieNode<TValue = unknown> {
  children: Record<string, ContextTrieNode<TValue>>;
  entries: ContextTrieEntry<TValue>[];
}

export interface ContextTrieEntry<TValue = unknown> {
  term: string;
  value: TValue;
}

export interface ContextMatch<TValue = unknown> {
  term: string;
  value: TValue;
  /** Original input offsets, ready for frontend highlight ranges. */
  startIndex: number;
  endIndex: number;
  text: string;
}

export interface CompiledContextMatcher<TValue = unknown> {
  findMatches(text: string): ContextMatch<TValue>[];
  hasMatch(text: string): boolean;
}

/** Builds reusable Aho-Corasick state for repeated text matching against one trie. */
export function createContextMatcher<TValue>(
  trie: ContextTrie<TValue>,
): CompiledContextMatcher<TValue> {
  const failureLinks = buildFailureLinks(trie.root);
  const termLengthCache = new WeakMap<ContextTrieEntry<TValue>, number>();

  return {
    findMatches(text: string): ContextMatch<TValue>[] {
      return findContextMatchesWithState({
        root: trie.root,
        failureLinks,
        termLengthCache,
        text,
      });
    },

    hasMatch(text: string): boolean {
      return hasContextMatchWithState({
        root: trie.root,
        failureLinks,
        termLengthCache,
        text,
      });
    },
  };
}

/** Finds every trie term that appears in text and returns highlight-ready ranges. */
export function findContextMatches<TValue>(
  trie: ContextTrie<TValue>,
  text: string,
): ContextMatch<TValue>[] {
  return createContextMatcher(trie).findMatches(text);
}

/** Fast convenience wrapper for callers that only need to know if any term exists. */
export function hasContextMatch<TValue>(
  trie: ContextTrie<TValue>,
  text: string,
): boolean {
  return createContextMatcher(trie).hasMatch(text);
}

interface FindWithStateParams<TValue> {
  root: ContextTrieNode<TValue>;
  failureLinks: WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>>;
  termLengthCache: WeakMap<ContextTrieEntry<TValue>, number>;
  text: string;
}

function findContextMatchesWithState<TValue>({
  root,
  failureLinks,
  termLengthCache,
  text,
}: FindWithStateParams<TValue>): ContextMatch<TValue>[] {
  const indexedTokens = createIndexedTokens(text);

  if (indexedTokens.length === 0) {
    return [];
  }

  const matches: ContextMatch<TValue>[] = [];
  let node = root;

  indexedTokens.forEach((indexedToken, tokenIndex) => {
    node = getNextNode(root, node, indexedToken.token, failureLinks);

    collectNodeMatches({
      root,
      node,
      failureLinks,
      termLengthCache,
      indexedTokens,
      tokenIndex,
      text,
      matches,
    });
  });

  return matches.sort((left, right) =>
    left.startIndex - right.startIndex ||
    left.endIndex - right.endIndex,
  );
}

function hasContextMatchWithState<TValue>({
  root,
  failureLinks,
  termLengthCache,
  text,
}: FindWithStateParams<TValue>): boolean {
  const indexedTokens = createIndexedTokens(text);

  if (indexedTokens.length === 0) {
    return false;
  }

  let node = root;

  for (let tokenIndex = 0; tokenIndex < indexedTokens.length; tokenIndex++) {
    node = getNextNode(root, node, indexedTokens[tokenIndex].token, failureLinks);

    if (nodeHasMatch({
      root,
      node,
      failureLinks,
      termLengthCache,
      tokenIndex,
    })) {
      return true;
    }
  }

  return false;
}

interface IndexedToken {
  token: string;
  startIndex: number;
  endIndex: number;
}

interface CollectNodeMatchesParams<TValue> {
  root: ContextTrieNode<TValue>;
  node: ContextTrieNode<TValue>;
  failureLinks: WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>>;
  termLengthCache: WeakMap<ContextTrieEntry<TValue>, number>;
  indexedTokens: IndexedToken[];
  tokenIndex: number;
  text: string;
  matches: ContextMatch<TValue>[];
}

interface NodeHasMatchParams<TValue> {
  root: ContextTrieNode<TValue>;
  node: ContextTrieNode<TValue>;
  failureLinks: WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>>;
  termLengthCache: WeakMap<ContextTrieEntry<TValue>, number>;
  tokenIndex: number;
}

/** Builds Aho-Corasick fallback links over word-token trie edges. */
function buildFailureLinks<TValue>(
  root: ContextTrieNode<TValue>,
): WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>> {
  const failureLinks = new WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>>();
  const queue: ContextTrieNode<TValue>[] = [];

  failureLinks.set(root, root);

  for (const child of Object.values(root.children)) {
    failureLinks.set(child, root);
    queue.push(child);
  }

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];

    for (const [token, child] of Object.entries(current.children)) {
      let fallback = failureLinks.get(current) ?? root;

      while (fallback !== root && !fallback.children[token]) {
        fallback = failureLinks.get(fallback) ?? root;
      }

      const fallbackChild = fallback.children[token];
      failureLinks.set(child, fallbackChild ?? root);
      queue.push(child);
    }
  }

  return failureLinks;
}

/** Follows fallback links until the current token can be consumed. */
function getNextNode<TValue>(
  root: ContextTrieNode<TValue>,
  node: ContextTrieNode<TValue>,
  token: string,
  failureLinks: WeakMap<ContextTrieNode<TValue>, ContextTrieNode<TValue>>,
): ContextTrieNode<TValue> {
  let current = node;

  while (current !== root && !current.children[token]) {
    current = failureLinks.get(current) ?? root;
  }

  return current.children[token] ?? root;
}

/** Collects direct and suffix matches from the current node's failure chain. */
function collectNodeMatches<TValue>({
  root,
  node,
  failureLinks,
  termLengthCache,
  indexedTokens,
  tokenIndex,
  text,
  matches,
}: CollectNodeMatchesParams<TValue>): void {
  let current: ContextTrieNode<TValue> | undefined = node;

  while (current && current !== root) {
    for (const entry of current.entries) {
      const termLength = getCachedTermLength(entry, termLengthCache);
      const startTokenIndex = tokenIndex - termLength + 1;

      if (startTokenIndex < 0) {
        continue;
      }

      const startIndex = indexedTokens[startTokenIndex].startIndex;
      const endIndex = indexedTokens[tokenIndex].endIndex;

      matches.push({
        term: entry.term,
        value: entry.value,
        startIndex,
        endIndex,
        text: text.slice(startIndex, endIndex),
      });
    }

    current = failureLinks.get(current);
  }
}

function nodeHasMatch<TValue>({
  root,
  node,
  failureLinks,
  termLengthCache,
  tokenIndex,
}: NodeHasMatchParams<TValue>): boolean {
  let current: ContextTrieNode<TValue> | undefined = node;

  while (current && current !== root) {
    for (const entry of current.entries) {
      const termLength = getCachedTermLength(entry, termLengthCache);

      if (tokenIndex - termLength + 1 >= 0) {
        return true;
      }
    }

    current = failureLinks.get(current);
  }

  return false;
}

function getCachedTermLength<TValue>(
  entry: ContextTrieEntry<TValue>,
  termLengthCache: WeakMap<ContextTrieEntry<TValue>, number>,
): number {
  const cached = termLengthCache.get(entry);

  if (cached !== undefined) {
    return cached;
  }

  const termLength = tokenizeContextTerm(entry.term).length;
  termLengthCache.set(entry, termLength);

  return termLength;
}

/** Tokenizes text while preserving each token's original start/end offsets. */
function createIndexedTokens(text: string): IndexedToken[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), match => {
    const value = match[0];
    const startIndex = match.index;

    return {
      token: value.toLowerCase(),
      startIndex,
      endIndex: startIndex + value.length,
    };
  });
}
