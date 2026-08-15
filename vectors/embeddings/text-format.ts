/** Applies model-specific instructions required when embedding local documents or queries. */
export function formatLocalEmbeddingText(
    modelName: string,
    text: string,
    inputType: 'document' | 'query',
): string {
    if (modelName.includes('mxbai') && inputType === 'query') {
        return `Represent this sentence for searching relevant passages: ${text}`;
    }
    return text;
}
