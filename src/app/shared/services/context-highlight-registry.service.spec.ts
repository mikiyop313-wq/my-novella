import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CompiledContextMatcher,
  ContextMatch,
} from '../../../../shared/utils/context-matcher';
import {
  ContextHighlightRegistryService,
  type ContextHighlightSource,
} from './context-highlight-registry.service';

describe('ContextHighlightRegistryService', () => {
  let registry: ContextHighlightRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ContextHighlightRegistryService],
    });

    registry = TestBed.inject(ContextHighlightRegistryService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('registers and unregisters highlight sources', () => {
    const unregister = registry.registerSource(createSource('codex', []));

    expect(registry.sources().map(source => source.id)).toEqual(['codex']);

    unregister();

    expect(registry.sources()).toEqual([]);
  });

  it('ignores sources with null matchers', () => {
    registry.registerSource({
      id: 'codex',
      matcher: signal<CompiledContextMatcher<string> | null>(null),
      getMatchKey: match => match.value,
    });

    expect(registry.getMatches('Mara waits.')).toEqual([]);
  });

  it('combines matches from multiple sources', () => {
    registry.registerSource(createSource('codex', [
      createMatch('mara', 'codex-1', 0, 4, 'Mara'),
    ]));
    registry.registerSource(createSource('glossary', [
      createMatch('key', 'glossary-1', 11, 14, 'key'),
    ]));

    expect(registry.getMatches('Mara found key.').map(match => ({
      sourceId: match.sourceId,
      matchKey: match.matchKey,
      className: match.className,
      label: match.label,
      text: match.text,
    }))).toEqual([
      {
        sourceId: 'codex',
        matchKey: 'codex-1',
        className: 'context-highlight--codex',
        label: 'Mara',
        text: 'Mara',
      },
      {
        sourceId: 'glossary',
        matchKey: 'glossary-1',
        className: 'context-highlight--glossary',
        label: 'key',
        text: 'key',
      },
    ]);
  });

  it('builds highlight segments with source metadata', () => {
    registry.registerSource(createSource('codex', [
      createMatch('mara', 'codex-1', 4, 8, 'Mara'),
    ]));

    const segments = registry.buildSegments('The Mara waits.');

    expect(segments[1]).toEqual(expect.objectContaining({
      startIndex: 4,
      endIndex: 8,
      text: 'Mara',
      isMatch: true,
    }));
    expect(segments[1].matches[0]).toEqual(expect.objectContaining({
      sourceId: 'codex',
      matchKey: 'codex-1',
    }));
  });

  it('selects a highlight immediately when it has one selectable match', async () => {
    const onSelect = vi.fn();
    registry.registerSource(createSource('codex', [
      createMatch('mara', 'codex-1', 0, 4, 'Mara'),
    ], { onSelect }));

    const [highlight] = registry.buildSegments('Mara');
    const result = await registry.selectHighlight(highlight);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'codex',
      matchKey: 'codex-1',
    }));
    expect(result).toEqual(expect.objectContaining({ status: 'selected' }));
  });

  it('requires a choice when one highlight contains multiple selectable matches', async () => {
    const codexSelect = vi.fn();
    const glossarySelect = vi.fn();
    registry.registerSource(createSource('codex', [
      createMatch('mara', 'codex-1', 0, 4, 'Mara'),
    ], { onSelect: codexSelect }));
    registry.registerSource(createSource('glossary', [
      createMatch('mara', 'glossary-1', 0, 4, 'Mara'),
    ], { onSelect: glossarySelect }));

    const [highlight] = registry.buildSegments('Mara');
    const result = await registry.selectHighlight(highlight);

    expect(result.status).toBe('requiresChoice');
    if (result.status === 'requiresChoice') {
      expect(result.matches.map(match => match.sourceId)).toEqual(['codex', 'glossary']);
    }
    expect(codexSelect).not.toHaveBeenCalled();
    expect(glossarySelect).not.toHaveBeenCalled();
  });
});

function createSource(
  id: string,
  matches: ContextMatch<string>[],
  overrides: Partial<ContextHighlightSource<string>> = {},
): ContextHighlightSource<string> {
  return {
    id,
    matcher: signal<CompiledContextMatcher<string> | null>(createMatcher(matches)),
    getMatchKey: match => match.value,
    ...overrides,
  };
}

function createMatcher<TValue>(
  matches: ContextMatch<TValue>[],
): CompiledContextMatcher<TValue> {
  return {
    findMatches: vi.fn(() => matches),
    hasMatch: vi.fn(() => matches.length > 0),
  };
}

function createMatch<TValue>(
  term: string,
  value: TValue,
  startIndex: number,
  endIndex: number,
  text: string,
): ContextMatch<TValue> {
  return {
    term,
    value,
    startIndex,
    endIndex,
    text,
  };
}
