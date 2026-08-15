import { EmbeddingProvider, OpenAIEmbeddingConfig } from '../types';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    public name: string;
    public dimensions: number;

    constructor(private config: OpenAIEmbeddingConfig) {
        this.name = config.modelName;
        // Default to 1536 if not specified, which is common for text-embedding-ada-002 and text-embedding-3-small
        this.dimensions = config.dimensions || 1536;
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

    public async embed(text: string): Promise<number[]> {
        const results = await this.embedBatch([text]);
        return results[0];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const url = this.getUrl();
        const payload: any = {
            model: this.config.modelName,
            input: texts,
        };

        if (this.config.dimensions) {
            payload.dimensions = this.config.dimensions;
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
