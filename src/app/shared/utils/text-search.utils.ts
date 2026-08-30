const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

export interface TextSearchOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
}

export interface TextSearchMatch {
  from: number;
  to: number;
}

export function findTextMatches(
  text: string,
  options: TextSearchOptions,
): TextSearchMatch[] {
  if (!text || !options.query) return [];

  const flags = options.matchCase ? 'gu' : 'giu';
  const expression = new RegExp(escapeRegExp(options.query), flags);
  const matches: TextSearchMatch[] = [];
  let match = expression.exec(text);

  while (match) {
    const from = match.index;
    const to = from + match[0].length;
    if (!options.wholeWord || hasWholeWordBoundaries(text, from, to)) {
      matches.push({ from, to });
    }
    match = expression.exec(text);
  }

  return matches;
}

function hasWholeWordBoundaries(text: string, from: number, to: number): boolean {
  const before = codePointBefore(text, from);
  const after = codePointAt(text, to);
  return (!before || !WORD_CHARACTER.test(before)) && (!after || !WORD_CHARACTER.test(after));
}

function codePointBefore(text: string, offset: number): string {
  return Array.from(text.slice(0, offset)).at(-1) ?? '';
}

function codePointAt(text: string, offset: number): string {
  return Array.from(text.slice(offset))[0] ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
