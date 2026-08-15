import type {
  CodexEntryStatus,
  CodexTrackingSetting,
} from '../models/codex.model';
import type { ContextTrie, ContextTrieNode } from './context-matcher';
import { tokenizeContextTerm } from './context-tokenizer';

export interface CodexContextTrieValue {
  entryId: string;
  trackingSetting: CodexTrackingSetting;
  status: CodexEntryStatus;
}

export type CodexContextTrieEntry = {
  id: string;
  name: string;
  alias: string | null;
  trackingSetting: CodexTrackingSetting;
  status: CodexEntryStatus;
};

/** Returns the normalized names and aliases that should trigger this Codex entry. */
export function getCodexEntryMatchTerms(
  entry: Pick<CodexContextTrieEntry, 'name' | 'alias'>,
): string[] {
  const terms = [
    entry.name,
    ...(entry.alias?.split(',') ?? []),
  ];

  return Array.from(new Set(terms.map(normalizeCodexTerm).filter(Boolean)));
}

/** Builds a word-token trie from non-archived Codex entries. */
export function buildCodexContextTrie(
  entries: readonly CodexContextTrieEntry[],
): ContextTrie<CodexContextTrieValue> {
  const root = createContextTrieNode<CodexContextTrieValue>();

  for (const entry of entries) {
    if (entry.status === 'archived') {
      continue;
    }

    const value: CodexContextTrieValue = {
      entryId: entry.id,
      trackingSetting: entry.trackingSetting,
      status: entry.status,
    };

    for (const term of getCodexEntryMatchTerms(entry)) {
      insertCodexTerm(root, term, value);
    }
  }

  return { root };
}

/** Inserts one normalized term into the trie and stores the Codex value at the leaf. */
function insertCodexTerm(
  root: ContextTrieNode<CodexContextTrieValue>,
  term: string,
  value: CodexContextTrieValue,
): void {
  let node = root;

  for (const token of tokenizeContextTerm(term)) {
    node.children[token] ??= createContextTrieNode<CodexContextTrieValue>();
    node = node.children[token];
  }

  node.entries.push({ term, value });
}

/** Creates an empty trie node. */
function createContextTrieNode<TValue>(): ContextTrieNode<TValue> {
  return {
    children: {},
    entries: [],
  };
}

/** Normalizes user-entered Codex names and aliases before trie insertion. */
function normalizeCodexTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, ' ').trim();
}
