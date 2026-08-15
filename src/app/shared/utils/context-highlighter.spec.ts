import { describe, expect, it } from 'vitest';

import type { ContextMatch } from '../../../../shared/utils/context-matcher';
import { buildContextHighlightSegments } from '../../../../shared/utils/context-highlighter';

describe('buildContextHighlightSegments', () => {
  it('returns one plain segment when no matches exist', () => {
    expect(buildContextHighlightSegments('The room is quiet.', [])).toEqual([
      {
        startIndex: 0,
        endIndex: 18,
        text: 'The room is quiet.',
        isMatch: false,
        matches: [],
      },
    ]);
  });

  it('splits text around one highlight', () => {
    const match = createMatch('mara', 'character', 4, 8, 'Mara');

    expect(buildContextHighlightSegments('The Mara waits.', [match])).toEqual([
      {
        startIndex: 0,
        endIndex: 4,
        text: 'The ',
        isMatch: false,
        matches: [],
      },
      {
        startIndex: 4,
        endIndex: 8,
        text: 'Mara',
        isMatch: true,
        matches: [match],
      },
      {
        startIndex: 8,
        endIndex: 15,
        text: ' waits.',
        isMatch: false,
        matches: [],
      },
    ]);
  });

  it('merges exact duplicate ranges into one highlighted segment', () => {
    const first = createMatch('mara', { entryId: 'codex-1' }, 0, 4, 'Mara');
    const second = createMatch('mara', { entryId: 'codex-2' }, 0, 4, 'Mara');

    expect(buildContextHighlightSegments('Mara', [first, second])).toEqual([
      {
        startIndex: 0,
        endIndex: 4,
        text: 'Mara',
        isMatch: true,
        matches: [first, second],
      },
    ]);
  });

  it('prefers the longer match when nested matches start at the same index', () => {
    const shorter = createMatch('silver', 'color', 0, 6, 'silver');
    const longer = createMatch('silver key', 'artifact', 0, 10, 'silver key');

    expect(buildContextHighlightSegments('silver key', [shorter, longer])).toEqual([
      {
        startIndex: 0,
        endIndex: 10,
        text: 'silver key',
        isMatch: true,
        matches: [longer],
      },
    ]);
  });

  it('preserves original text casing and punctuation from the input range', () => {
    const match = createMatch('mara vale', 'character', 0, 9, 'MARA-Vale');

    expect(buildContextHighlightSegments('MARA-Vale arrives.', [match])[0]).toEqual({
      startIndex: 0,
      endIndex: 9,
      text: 'MARA-Vale',
      isMatch: true,
      matches: [match],
    });
  });

  it('ignores invalid ranges', () => {
    const invalid = createMatch('mara', 'character', 8, 4, '');

    expect(buildContextHighlightSegments('The Mara waits.', [invalid])).toEqual([
      {
        startIndex: 0,
        endIndex: 15,
        text: 'The Mara waits.',
        isMatch: false,
        matches: [],
      },
    ]);
  });
});

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
