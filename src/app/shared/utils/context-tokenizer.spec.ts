import { describe, expect, it } from 'vitest';

import { tokenizeContextWords } from '../../../../shared/utils/context-tokenizer';

describe('context tokenizer', () => {
  it('splits paragraph text into lowercase word tokens', () => {
    expect(tokenizeContextWords('Mara, mara! Found the silver-key.')).toEqual([
      'mara',
      'found',
      'the',
      'silver',
      'key',
    ]);
  });

  it('ignores punctuation-only fragments', () => {
    expect(tokenizeContextWords('Wait... who? Mara!')).toEqual([
      'wait',
      'who',
      'mara',
    ]);
  });

  it('returns duplicate words once in first-seen order', () => {
    expect(tokenizeContextWords('Gate gate GATE opens gate')).toEqual([
      'gate',
      'opens',
    ]);
  });

  it('returns no tokens for empty or blank input', () => {
    expect(tokenizeContextWords('')).toEqual([]);
    expect(tokenizeContextWords('   ... --- !!!   ')).toEqual([]);
  });
});
