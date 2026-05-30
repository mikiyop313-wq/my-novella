import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';
import { EmbeddingProvider, LocalEmbeddingConfig } from '../types';

export class LocalEmbeddingProvider implements EmbeddingProvider {
    private embedder: FeatureExtractionPipeline | null = null;
    private initPromise: Promise<void> | null = null;

    public name: string;
    public dimensions: number;

    constructor(private config: LocalEmbeddingConfig) {
        this.name = config.modelName;
        this.dimensions = config.dimensions;
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

    private formatText(text: string): string {
        // mxbai-embed-large-v1 uses a specific instruction prefix for search queries
        if (this.config.modelName.includes('mxbai')) {
            if (this.config.inputType === 'query') {
                return `Represent this sentence for searching relevant passages: ${text}`;
            }
            // For 'document' (storing in DB), mxbai does not require a prefix
        }
        return text;
    }

    public async embed(text: string): Promise<number[]> {
        await this.initialize();
        if (!this.embedder) throw new Error('Embedder not initialized');

        const formattedText = this.formatText(text);

        // Run the pipeline
        const output = await this.embedder(formattedText, {
            pooling: 'mean',
            normalize: true,
        });

        // The output tensor data is a Float32Array. Convert to a standard number array.
        return Array.from(output.data);
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        await this.initialize();
        if (!this.embedder) throw new Error('Embedder not initialized');

        const formattedTexts = texts.map(t => this.formatText(t));

        // Run the pipeline on the batch
        const output = await this.embedder(formattedTexts, {
            pooling: 'mean',
            normalize: true,
        });

        // The output for a batch is a tensor with shape [batch_size, dimensions]
        // The .data property is a flattened Float32Array of length (batch_size * dimensions)
        const result: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
            const start = i * this.dimensions;
            const end = start + this.dimensions;
            result.push(Array.from(output.data.slice(start, end)));
        }

        return result;
    }
}
