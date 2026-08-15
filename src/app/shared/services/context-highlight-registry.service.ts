import { Injectable, type Signal, signal } from '@angular/core';

import type {
  CompiledContextMatcher,
  ContextMatch,
} from '../../../../shared/utils/context-matcher';
import {
  buildContextHighlightSegments,
  type ContextHighlight,
  type ContextHighlightSegment,
} from '../../../../shared/utils/context-highlighter';

export interface ContextHighlightSource<TValue = unknown> {
  id: string;
  priority?: number;
  className?: string;
  matcher: Signal<CompiledContextMatcher<TValue> | null>;
  getMatchKey(match: ContextMatch<TValue>): string;
  getMatchLabel?(match: ContextMatch<TValue>): string;
  onSelect?(match: ContextMatch<TValue>): void | Promise<void>;
}

export interface RegisteredContextMatch<TValue = unknown> extends ContextMatch<TValue> {
  source: ContextHighlightSource<TValue>;
  sourceId: string;
  sourcePriority: number;
  className: string;
  matchKey: string;
  label: string;
}

export type ContextHighlightSelectionResult<TValue = unknown> =
  | { status: 'selected'; match: RegisteredContextMatch<TValue> }
  | { status: 'requiresChoice'; matches: RegisteredContextMatch<TValue>[] }
  | { status: 'ignored'; reason: 'no-match' | 'no-selectable-match' };

@Injectable({
  providedIn: 'root',
})
export class ContextHighlightRegistryService {
  private readonly sourcesState = signal<ContextHighlightSource[]>([]);

  readonly sources = this.sourcesState.asReadonly();

  registerSource<TValue>(source: ContextHighlightSource<TValue>): () => void {
    const registeredSource = source as ContextHighlightSource;

    this.sourcesState.update(sources => [
      ...sources.filter(existing => existing.id !== registeredSource.id),
      registeredSource,
    ]);

    return () => {
      this.sourcesState.update(sources =>
        sources.filter(existing => existing !== registeredSource),
      );
    };
  }

  getMatches(
    text: string,
    sourceIds?: readonly string[],
  ): RegisteredContextMatch[] {
    const allowedSourceIds = sourceIds ? new Set(sourceIds) : null;
    const matches: RegisteredContextMatch[] = [];

    for (const source of this.getActiveSources(allowedSourceIds)) {
      const matcher = source.matcher();

      if (!matcher) {
        continue;
      }

      for (const match of matcher.findMatches(text)) {
        matches.push(this.registerMatch(source, match));
      }
    }

    return matches.sort((left, right) =>
      left.startIndex - right.startIndex ||
      left.endIndex - right.endIndex ||
      right.sourcePriority - left.sourcePriority ||
      left.sourceId.localeCompare(right.sourceId),
    );
  }

  buildSegments(
    text: string,
    sourceIds?: readonly string[],
  ): ContextHighlightSegment<RegisteredContextMatch>[] {
    return buildContextHighlightSegments(text, this.getMatches(text, sourceIds));
  }

  async selectMatch<TValue>(
    match: RegisteredContextMatch<TValue>,
  ): Promise<ContextHighlightSelectionResult<TValue>> {
    if (!match.source.onSelect) {
      return { status: 'ignored', reason: 'no-selectable-match' };
    }

    await match.source.onSelect(match);

    return { status: 'selected', match };
  }

  async selectHighlight<TValue>(
    highlight: Pick<
      ContextHighlight<RegisteredContextMatch<TValue>> |
      ContextHighlightSegment<RegisteredContextMatch<TValue>>,
      'matches'
    >,
  ): Promise<ContextHighlightSelectionResult<TValue>> {
    const selectableMatches = highlight.matches.filter(match => match.source.onSelect);

    if (selectableMatches.length === 0) {
      return {
        status: 'ignored',
        reason: highlight.matches.length === 0 ? 'no-match' : 'no-selectable-match',
      };
    }

    if (selectableMatches.length > 1) {
      return { status: 'requiresChoice', matches: [...selectableMatches] };
    }

    return this.selectMatch(selectableMatches[0]);
  }

  private getActiveSources(allowedSourceIds: Set<string> | null): ContextHighlightSource[] {
    return this.sourcesState()
      .filter(source => !allowedSourceIds || allowedSourceIds.has(source.id))
      .sort((left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0) ||
        left.id.localeCompare(right.id),
      );
  }

  private registerMatch<TValue>(
    source: ContextHighlightSource<TValue>,
    match: ContextMatch<TValue>,
  ): RegisteredContextMatch<TValue> {
    return {
      ...match,
      source,
      sourceId: source.id,
      sourcePriority: source.priority ?? 0,
      className: source.className ?? `context-highlight--${source.id}`,
      matchKey: source.getMatchKey(match),
      label: source.getMatchLabel?.(match) ?? match.text,
    };
  }
}
