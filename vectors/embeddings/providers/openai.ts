import { EmbeddingProvider, OpenAIEmbeddingConfig } from '../types';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    public readonly space;

    constructor(private config: OpenAIEmbeddingConfig) {
        this.space = {
            provider: 'openAI' as const,
            model: config.modelName,
            dimensions: config.dimensions || 1536,
            revision: '1',
        };
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
        };
        if (this.config.organization) {
            headers['OpenAI-Organization'] = this.config.organization;
        }
        return headers;
    }

    private getUrl(): string {
        return this.config.baseUrl || 'https://api.openai.com/v1/embeddings';
    }

    public async embedQuery(text: string): Promise<number[]> {
        const results = await this.embedTexts([text]);
        return results[0];
    }

    public async embedDocuments(texts: string[]): Promise<number[][]> {
        return this.embedTexts(texts);
    }

    private async embedTexts(texts: string[]): Promise<number[][]> {
        const url = this.getUrl();
        const payload: any = {
            model: this.config.modelName,
            input: texts,
        };

        if (this.space.dimensions) {
            payload.dimensions = this.space.dimensions;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // Ensure results are sorted by index
        data.data.sort((a: any, b: any) => a.index - b.index);

        return data.data.map((item: any) => item.embedding);
    }
}
