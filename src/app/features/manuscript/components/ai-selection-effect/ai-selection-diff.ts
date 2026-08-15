export type AiSelectionDiffKind = 'unchanged' | 'removed' | 'added';

export interface AiSelectionDiffSegment {
  kind: AiSelectionDiffKind;
  text: string;
}

interface DiffToken {
  kind: AiSelectionDiffKind;
  text: string;
}

/** Produces a word-level diff while retaining punctuation, spacing, and line breaks. */
export function buildAiSelectionDiff(
  originalText: string,
  suggestedText: string,
): AiSelectionDiffSegment[] {
  const originalTokens = tokenize(originalText);
  const suggestedTokens = tokenize(suggestedText);
  const trace: Map<number, number>[] = [];
  const furthestXByDiagonal = new Map<number, number>([[1, 0]]);
  const maximumEditDistance = originalTokens.length + suggestedTokens.length;

  for (let distance = 0; distance <= maximumEditDistance; distance += 1) {
    trace.push(new Map(furthestXByDiagonal));

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const deletionX = furthestXByDiagonal.get(diagonal - 1) ?? -1;
      const insertionX = furthestXByDiagonal.get(diagonal + 1) ?? -1;
      let x = diagonal === -distance || (diagonal !== distance && deletionX < insertionX)
        ? Math.max(insertionX, 0)
        : deletionX + 1;
      let y = x - diagonal;

      while (
        x < originalTokens.length
        && y < suggestedTokens.length
        && originalTokens[x] === suggestedTokens[y]
      ) {
        x += 1;
        y += 1;
      }

      furthestXByDiagonal.set(diagonal, x);
      if (x >= originalTokens.length && y >= suggestedTokens.length) {
        return groupChangedPhrases(mergeAdjacentSegments(backtrackDiff({
          originalTokens,
          suggestedTokens,
          trace,
        })));
      }
    }
  }

  return [];
}

function tokenize(text: string): string[] {
  return text.match(/\r\n|\n|[^\S\r\n]+|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu) ?? [];
}

function backtrackDiff(options: {
  originalTokens: string[];
  suggestedTokens: string[];
  trace: Map<number, number>[];
}): DiffToken[] {
  let x = options.originalTokens.length;
  let y = options.suggestedTokens.length;
  const reversedTokens: DiffToken[] = [];

  for (let distance = options.trace.length - 1; distance >= 0; distance -= 1) {
    const furthestXByDiagonal = options.trace[distance];
    const diagonal = x - y;
    const deletionX = furthestXByDiagonal.get(diagonal - 1) ?? -1;
    const insertionX = furthestXByDiagonal.get(diagonal + 1) ?? -1;
    const previousDiagonal = diagonal === -distance
      || (diagonal !== distance && deletionX < insertionX)
      ? diagonal + 1
      : diagonal - 1;
    const previousX = Math.max(furthestXByDiagonal.get(previousDiagonal) ?? 0, 0);
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      reversedTokens.push({ kind: 'unchanged', text: options.originalTokens[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (distance > 0 && x === previousX) {
      reversedTokens.push({ kind: 'added', text: options.suggestedTokens[y - 1] });
      y -= 1;
    } else if (distance > 0) {
      reversedTokens.push({ kind: 'removed', text: options.originalTokens[x - 1] });
      x -= 1;
    }
  }

  return reversedTokens.reverse();
}

function mergeAdjacentSegments(tokens: DiffToken[]): AiSelectionDiffSegment[] {
  const segments: AiSelectionDiffSegment[] = [];

  tokens.forEach(token => {
    const previousSegment = segments.at(-1);
    if (previousSegment?.kind === token.kind) {
      previousSegment.text += token.text;
    } else {
      segments.push({ ...token });
    }
  });

  return segments;
}

function groupChangedPhrases(segments: AiSelectionDiffSegment[]): AiSelectionDiffSegment[] {
  const groupedSegments: AiSelectionDiffSegment[] = [];
  let index = 0;

  while (index < segments.length) {
    const segment = segments[index];
    if (segment.kind === 'unchanged') {
      groupedSegments.push(segment);
      index += 1;
    } else {
      let regionEnd = index + 1;
      while (
        regionEnd < segments.length
        && (
          segments[regionEnd].kind !== 'unchanged'
          || /^\s+$/u.test(segments[regionEnd].text)
        )
      ) {
        regionEnd += 1;
      }

      const region = segments.slice(index, regionEnd);
      const hasRemovedText = region.some(part => part.kind === 'removed');
      const hasAddedText = region.some(part => part.kind === 'added');
      if (hasRemovedText && hasAddedText) {
        groupedSegments.push({
          kind: 'removed',
          text: region.filter(part => part.kind !== 'added').map(part => part.text).join(''),
        });
        groupedSegments.push({
          kind: 'added',
          text: region.filter(part => part.kind !== 'removed').map(part => part.text).join(''),
        });
      } else {
        groupedSegments.push(...region);
      }
      index = regionEnd;
    }
  }

  return groupedSegments;
}
