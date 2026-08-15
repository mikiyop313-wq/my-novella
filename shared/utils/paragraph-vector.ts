/** Normalizes paragraph content so equivalent whitespace produces the same embedding input. */
export function normalizeParagraphVectorText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

/** Creates a stable, compact identifier for normalized paragraph content. */
export function hashParagraphVectorText(text: string): string {
    let hash = 5381;
    for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
}
