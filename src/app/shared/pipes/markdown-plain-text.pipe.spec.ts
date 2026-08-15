import { describe, expect, it } from 'vitest';

import { MarkdownPlainTextPipe, markdownToPlainText } from './markdown-plain-text.pipe';

describe('MarkdownPlainTextPipe', () => {
  it('returns an empty string for missing content', () => {
    const pipe = new MarkdownPlainTextPipe();

    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('flattens Markdown while retaining visible labels and content', () => {
    const markdown = [
      '# Profile',
      '',
      '**Mara** visits [Silver Keep](https://example.com).',
      '',
      '![Portrait](portrait.png)',
      '',
      '- Uses `moon magic`',
      '- *Fearless*',
    ].join('\n');

    expect(markdownToPlainText(markdown)).toBe(
      'Profile Mara visits Silver Keep. Portrait Uses moon magic Fearless',
    );
  });

  it('keeps safe visible HTML text while dropping non-content elements', () => {
    expect(markdownToPlainText('<span>Visible</span><script>alert(1)</script>')).toBe('Visible');
  });
});
