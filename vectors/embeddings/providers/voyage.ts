import { EmbeddingProvider, VoyageEmbeddingConfig } from '../types';

export class VoyageEmbeddingProvider implements EmbeddingProvider {
    public readonly space;

    constructor(private config: VoyageEmbeddingConfig) {
        this.space = {
            provider: 'voyage' as const,
            model: config.modelName,
            dimensions: config.dimensions || 1024,
            revision: '1',
        };
    }

    public async embedQuery(text: string): Promise<number[]> {
        const results = await this.embedTexts([text], 'query');
        return results[0];
    }

    public async embedDocuments(texts: string[]): Promise<number[][]> {
        return this.embedTexts(texts, 'document');
    }

    private async embedTexts(
        texts: string[],
        inputType: 'document' | 'query',
    ): Promise<number[][]> {
        const url = 'https://api.voyageai.com/v1/embeddings';
        const payload: any = {
            model: this.config.modelName,
            input: texts,
        };

        payload.input_type = inputType;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Voyage API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        return data.data.map((item: any) => item.embedding);
    }
}
