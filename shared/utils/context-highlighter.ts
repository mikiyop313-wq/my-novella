import type { ContextMatch } from './context-matcher';

export interface ContextHighlight<TMatch extends ContextMatch = ContextMatch> {
  startIndex: number;
  endIndex: number;
  text: string;
  matches: TMatch[];
}

export interface ContextHighlightSegment<TMatch extends ContextMatch = ContextMatch> {
  startIndex: number;
  endIndex: number;
  text: string;
  isMatch: boolean;
  matches: TMatch[];
}

/** Converts raw context matches into non-overlapping, UI-ready text segments. */
export function buildContextHighlightSegments<TMatch extends ContextMatch>(
  text: string,
  matches: readonly TMatch[],
): ContextHighlightSegment<TMatch>[] {
  if (!text) {
    return [];
  }

  const highlights = resolveHighlights(text, matches);

  if (highlights.length === 0) {
    return [createPlainSegment(text, 0, text.length)];
  }

  const segments: ContextHighlightSegment<TMatch>[] = [];
  let cursor = 0;

  for (const highlight of highlights) {
    if (cursor < highlight.startIndex) {
      segments.push(createPlainSegment(text, cursor, highlight.startIndex));
    }

    segments.push({
      startIndex: highlight.startIndex,
      endIndex: highlight.endIndex,
      text: highlight.text,
      isMatch: true,
      matches: highlight.matches,
    });

    cursor = highlight.endIndex;
  }

  if (cursor < text.length) {
    segments.push(createPlainSegment(text, cursor, text.length));
  }

  return segments;
}

function resolveHighlights<TMatch extends ContextMatch>(
  text: string,
  matches: readonly TMatch[],
): ContextHighlight<TMatch>[] {
  const grouped = new Map<string, ContextHighlight<TMatch>>();

  for (const match of matches) {
    if (!isValidMatch(text, match)) {
      continue;
    }

    const key = `${match.startIndex}:${match.endIndex}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.matches.push(match);
      continue;
    }

    grouped.set(key, {
      startIndex: match.startIndex,
      endIndex: match.endIndex,
      text: text.slice(match.startIndex, match.endIndex),
      matches: [match],
    });
  }

  const ordered = [...grouped.values()].sort((left, right) =>
    left.startIndex - right.startIndex ||
    (right.endIndex - right.startIndex) - (left.endIndex - left.startIndex) ||
    left.endIndex - right.endIndex,
  );

  const highlights: ContextHighlight<TMatch>[] = [];
  let currentEnd = 0;

  for (const highlight of ordered) {
    if (highlight.startIndex < currentEnd) {
      continue;
    }

    highlights.push(highlight);
    currentEnd = highlight.endIndex;
  }

  return highlights;
}

function isValidMatch(text: string, match: ContextMatch): boolean {
  return (
    Number.isInteger(match.startIndex) &&
    Number.isInteger(match.endIndex) &&
    match.startIndex >= 0 &&
    match.endIndex <= text.length &&
    match.startIndex < match.endIndex
  );
}

function createPlainSegment<TMatch extends ContextMatch>(
  text: string,
  startIndex: number,
  endIndex: number,
): ContextHighlightSegment<TMatch> {
  return {
    startIndex,
    endIndex,
    text: text.slice(startIndex, endIndex),
    isMatch: false,
    matches: [],
  };
}
