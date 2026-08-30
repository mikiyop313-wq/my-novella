import { describe, expect, it } from 'vitest';

import { findTextMatches } from '../text-search.utils';

describe('findTextMatches', () => {
  it('finds literal text without case sensitivity by default', () => {
    expect(findTextMatches('Use [draft] and [DRAFT].', {
      query: '[draft]',
      matchCase: false,
      wholeWord: false,
    })).toEqual([
      { from: 4, to: 11 },
      { from: 16, to: 23 },
    ]);
  });

  it('supports case-sensitive and Unicode whole-word matching', () => {
    const text = 'Élan élan_2 élan.';

    expect(findTextMatches(text, {
      query: 'élan',
      matchCase: true,
      wholeWord: true,
    })).toEqual([{ from: 12, to: 16 }]);
  });

  it('returns no matches for empty text or queries', () => {
    const options = { query: '', matchCase: false, wholeWord: false };
    expect(findTextMatches('Prompt text', options)).toEqual([]);
    expect(findTextMatches('', { ...options, query: 'prompt' })).toEqual([]);
  });
});
