import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';
import { EmbeddingProvider, LocalEmbeddingConfig } from '../types';
import { formatLocalEmbeddingText } from '../text-format';

export class LocalEmbeddingProvider implements EmbeddingProvider {
    private embedder: FeatureExtractionPipeline | null = null;
    private initPromise: Promise<void> | null = null;

    public readonly space;

    constructor(private config: LocalEmbeddingConfig) {
        this.space = {
            provider: 'local' as const,
            model: config.modelName,
            dimensions: config.dimensions,
            revision: '1',
        };
    }

    private async initialize() {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                // Explicitly allow downloading models from HuggingFace.
                // Required in Electron where remote access can be restricted.
                env.allowRemoteModels = true;

                // If a local model path is provided, configure the environment to use it
                if (this.config.modelPath) {
                    env.allowLocalModels = true;
                    env.localModelPath = this.config.modelPath;
                }

                // Set the cache directory so downloaded model files land in a
                // writable location (e.g. app.getPath('userData') in Electron).
                if (this.config.cacheDir) {
                    env.cacheDir = this.config.cacheDir;
                }

                // Initialize the feature-extraction pipeline
                this.embedder = await pipeline('feature-extraction', this.config.modelName, {
                    quantized: true, // Use the smaller, optimized ONNX weights
                });
            })();
        }
        await this.initPromise;
    }

    private formatText(text: string, inputType: 'document' | 'query'): string {
        return formatLocalEmbeddingText(this.config.modelName, text, inputType);
    }

    public async embedQuery(text: string): Promise<number[]> {
        const [vector] = await this.embedTexts([text], 'query');
        return vector;
    }

    public async embedDocuments(texts: string[]): Promise<number[][]> {
        return this.embedTexts(texts, 'document');
    }

    private async embedTexts(
        texts: string[],
        inputType: 'document' | 'query',
    ): Promise<number[][]> {
        await this.initialize();
        if (!this.embedder) throw new Error('Embedder not initialized');

        const formattedTexts = texts.map(t => this.formatText(t, inputType));

        // Run the pipeline on the batch
        const output = await this.embedder(formattedTexts, {
            pooling: 'mean',
            normalize: true,
        });

        // The output for a batch is a tensor with shape [batch_size, dimensions]
        // The .data property is a flattened Float32Array of length (batch_size * dimensions)
        const result: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
            const start = i * this.space.dimensions;
            const end = start + this.space.dimensions;
            result.push(Array.from(output.data.slice(start, end)));
        }

        return result;
    }
}
