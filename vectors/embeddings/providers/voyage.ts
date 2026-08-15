import { EmbeddingProvider, VoyageEmbeddingConfig } from '../types';

export class VoyageEmbeddingProvider implements EmbeddingProvider {
    public name: string;
    public dimensions: number;

    constructor(private config: VoyageEmbeddingConfig) {
        this.name = config.modelName;
        // Default to 1024 if not specified, which is common for voyage-2, voyage-3, voyage-law-2 etc.
        this.dimensions = config.dimensions || 1024;
    }

    public async embed(text: string): Promise<number[]> {
        const results = await this.embedBatch([text]);
        return results[0];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const url = 'https://api.voyageai.com/v1/embeddings';
        const payload: any = {
            model: this.config.modelName,
            input: texts,
        };

        if (this.config.inputType) {
            payload.input_type = this.config.inputType;
        }

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
