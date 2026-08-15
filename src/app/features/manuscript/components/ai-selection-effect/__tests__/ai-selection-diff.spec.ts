import { describe, expect, it } from 'vitest';

import { buildAiSelectionDiff } from '../ai-selection-diff';

describe('buildAiSelectionDiff', () => {
  it('marks changed words while retaining punctuation and whitespace', () => {
    expect(buildAiSelectionDiff(
      'Elias looked away.',
      'Elias lowered his gaze.',
    )).toEqual([
      { kind: 'unchanged', text: 'Elias ' },
      { kind: 'removed', text: 'looked away' },
      { kind: 'added', text: 'lowered his gaze' },
      { kind: 'unchanged', text: '.' },
    ]);
  });

  it('retains paragraph breaks in the comparison', () => {
    const segments = buildAiSelectionDiff(
      'First paragraph.\nSecond line.',
      'First paragraph.\nA changed line.',
    );

    expect(segments.map(segment => segment.text).join('')).toContain('\n');
    expect(segments).toContainEqual({ kind: 'removed', text: 'Second ' });
    expect(segments).toContainEqual({ kind: 'added', text: 'A changed ' });
  });

  it('handles entirely added or removed text', () => {
    expect(buildAiSelectionDiff('', 'New text.')).toEqual([
      { kind: 'added', text: 'New text.' },
    ]);
    expect(buildAiSelectionDiff('Old text.', '')).toEqual([
      { kind: 'removed', text: 'Old text.' },
    ]);
  });
});
