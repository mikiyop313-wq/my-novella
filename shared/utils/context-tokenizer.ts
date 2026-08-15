/** Returns unique lowercase word tokens in first-seen order. */
export function tokenizeContextWords(value: string): string[] {
  return Array.from(
    new Set(
      tokenizeContextTerm(value),
    ),
  );
}

/** Splits a phrase into lowercase word tokens; punctuation is treated as a separator. */
export function tokenizeContextTerm(value: string): string[] {
  return Array.from(value.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu), match => match[0]);
}
