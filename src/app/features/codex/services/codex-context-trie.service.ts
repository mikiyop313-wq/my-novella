import { Injectable, computed, inject, signal } from '@angular/core';

import {
  buildCodexContextTrie,
  type CodexContextTrieEntry,
  type CodexContextTrieValue,
} from '../../../../../shared/utils/codex-context-trie';
import {
  createContextMatcher,
  type CompiledContextMatcher,
  type ContextMatch,
  type ContextTrie,
} from '../../../../../shared/utils/context-matcher';
import { CodexService } from './codex.service';

@Injectable({
  providedIn: 'root',
})
export class CodexContextTrieService {
  private readonly codexService = inject(CodexService);

  private readonly contextIdState = signal<string | null>(null);
  private readonly entriesState = signal<CodexContextTrieEntry[]>([]);
  private readonly trieState = signal<ContextTrie<CodexContextTrieValue> | null>(null);
  private readonly matcherState = computed<CompiledContextMatcher<CodexContextTrieValue> | null>(
    () => {
      const trie = this.trieState();
      return trie ? createContextMatcher(trie) : null;
    },
  );
  private readonly isLoadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private loadRequestId = 0;

  readonly contextId = this.contextIdState.asReadonly();
  readonly entries = this.entriesState.asReadonly();
  readonly trie = this.trieState.asReadonly();
  readonly isLoading = this.isLoadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  findMatches(text: string): ContextMatch<CodexContextTrieValue>[] {
    return this.matcherState()?.findMatches(text) ?? [];
  }

  async loadForContext(contextId: string | null): Promise<void> {
    const requestId = ++this.loadRequestId;

    if (!contextId) {
      this.contextIdState.set(null);
      this.entriesState.set([]);
      this.trieState.set(null);
      this.isLoadingState.set(false);
      this.errorState.set(null);
      return;
    }

    this.contextIdState.set(contextId);
    this.isLoadingState.set(true);
    this.errorState.set(null);

    try {
      const entries = await this.codexService.getEntries(contextId, { status: 'active' });

      if (requestId !== this.loadRequestId) return;

      this.entriesState.set(entries);
      this.trieState.set(buildCodexContextTrie(entries));
    } catch (error) {
      if (requestId !== this.loadRequestId) return;

      this.entriesState.set([]);
      this.trieState.set(null);
      this.errorState.set(
        error instanceof Error ? error.message : 'Failed to load Codex context trie.',
      );
    } finally {
      if (requestId === this.loadRequestId) {
        this.isLoadingState.set(false);
      }
    }
  }

  async refreshCurrentContext(): Promise<void> {
    await this.loadForContext(this.contextIdState());
  }
}
