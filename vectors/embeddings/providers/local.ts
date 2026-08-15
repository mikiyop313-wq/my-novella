
/**
 * Loads the managed Transformers.js embedding pipeline and coordinates its runtime lifecycle.
 *
 * @packageDocumentation
 */

import { pipeline, env } from '@xenova/transformers';
import type { FeatureExtractionPipeline } from '@xenova/transformers';
import { access } from 'fs/promises';

import {
    EmbeddingProvider,
    LocalEmbeddingConfig,
    LocalEmbeddingDownloadProgressCallback,
} from '../types';
import { formatLocalEmbeddingText } from '../text-format';

/** Indicates that local vector work was requested before the model was explicitly installed. */
export class LocalEmbeddingModelNotInstalledError extends Error {
    constructor() {
        super('The local embedding model is not installed. Download it from Vector Search settings.');
        this.name = 'LocalEmbeddingModelNotInstalledError';
    }
}

/** Generates normalized local embeddings while preventing downloads during ordinary vector work. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
    private embedder: FeatureExtractionPipeline | null = null;
    private initPromise: Promise<void> | null = null;
    private initAllowsRemoteModels = false;
    private disposePromise: Promise<void> | null = null;
    private disposeRequested = false;
    private activeEmbeddingOperations = 0;
    private readonly idleWaiters = new Set<() => void>();

    public readonly space;

    /** Creates a provider for one local model configuration. */
    constructor(private config: LocalEmbeddingConfig) {
        this.space = {
            provider: 'local' as const,
            model: config.modelName,
            dimensions: config.dimensions,
            revision: '1',
        };
    }

    /**
     * Reuses or starts pipeline initialization and permits retry after a failed attempt.
     *
     * @param allowRemoteModels - Whether this initialization may contact Hugging Face.
     * @param onProgress - Optional callback for explicit-download progress.
     */
    private async initialize(
        allowRemoteModels: boolean,
        onProgress?: LocalEmbeddingDownloadProgressCallback,
    ): Promise<void> {
        this.assertAvailable();
        if (this.embedder) return;

        if (this.initPromise && allowRemoteModels && !this.initAllowsRemoteModels) {
            await this.initPromise.catch(() => undefined);
        }

        if (!this.initPromise) {
            this.initAllowsRemoteModels = allowRemoteModels;
            const initialization = this.loadPipeline(allowRemoteModels, onProgress);
            this.initPromise = initialization;
            try {
                await initialization;
            } catch (error) {
                if (this.initPromise === initialization) this.initPromise = null;
                throw error;
            }
            return;
        }

        await this.initPromise;
    }

    /**
     * Loads the tokenizer and ONNX feature-extraction pipeline in local-only or download mode.
     *
     * Remote access is disabled again after the initialization attempt completes.
     */
    private async loadPipeline(
        allowRemoteModels: boolean,
        onProgress?: LocalEmbeddingDownloadProgressCallback,
    ): Promise<void> {
        if (!allowRemoteModels && !await this.hasInstallationMarker()) {
            throw new LocalEmbeddingModelNotInstalledError();
        }

        env.allowLocalModels = true;
        env.allowRemoteModels = allowRemoteModels;

        if (this.config.modelPath) env.localModelPath = this.config.modelPath;
        if (this.config.cacheDir) env.cacheDir = this.config.cacheDir;

        try {
            const sourceModelName = this.config.sourceModelName ?? this.config.modelName;
            this.embedder = await pipeline('feature-extraction', sourceModelName, {
                quantized: this.config.quantized ?? true,
                local_files_only: !allowRemoteModels,
                progress_callback: onProgress
                    ? (event: {
                        status: string;
                        file?: string;
                        loaded?: number;
                        total?: number;
                        progress?: number;
                    }) => onProgress({
                        status: event.status as Parameters<LocalEmbeddingDownloadProgressCallback>[0]['status'],
                        file: event.file ?? sourceModelName,
                        loaded: event.loaded,
                        total: event.total,
                        progress: event.progress,
                    })
                    : undefined,
            });
        } finally {
            env.allowRemoteModels = false;
        }
    }

    /** Returns whether a completed explicit installation has written its marker file. */
    private async hasInstallationMarker(): Promise<boolean> {
        try {
            await access(this.config.installationMarkerPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Explicitly permits Transformers.js to download and initialize the configured model.
     *
     * @param onProgress - Optional receiver for normalized per-file progress events.
     */
    public async download(
        onProgress?: LocalEmbeddingDownloadProgressCallback,
    ): Promise<void> {
        await this.initialize(true, onProgress);
    }

    /**
     * Rejects new embedding work, waits for active calls, and releases the ONNX pipeline.
     */
    public async dispose(): Promise<void> {
        if (this.disposePromise) return this.disposePromise;

        this.disposeRequested = true;
        this.disposePromise = (async () => {
            await this.waitForIdle();
            await this.initPromise?.catch(() => undefined);
            await this.embedder?.dispose();
            this.embedder = null;
            this.initPromise = null;
        })();
        return this.disposePromise;
    }

    /** Throws when the provider has entered its terminal disposal state. */
    private assertAvailable(): void {
        if (this.disposeRequested) {
            throw new Error('The local embedding model is being uninstalled.');
        }
    }

    /** Waits until every embedding operation that already started has completed. */
    private async waitForIdle(): Promise<void> {
        if (this.activeEmbeddingOperations === 0) return;
        await new Promise<void>(resolve => this.idleWaiters.add(resolve));
    }

    /** Records one completed embedding operation and releases disposal waiters when idle. */
    private finishEmbeddingOperation(): void {
        this.activeEmbeddingOperations -= 1;
        if (this.activeEmbeddingOperations !== 0) return;
        for (const resolve of this.idleWaiters) resolve();
        this.idleWaiters.clear();
    }

    /** Applies any model-specific document or query instruction. */
    private formatText(text: string, inputType: 'document' | 'query'): string {
        return formatLocalEmbeddingText(this.config.modelName, text, inputType);
    }

    /** Produces one normalized vector for semantic search input. */
    public async embedQuery(text: string): Promise<number[]> {
        const [vector] = await this.embedTexts([text], 'query');
        return vector;
    }

    /** Produces normalized vectors for manuscript document text. */
    public async embedDocuments(texts: string[]): Promise<number[][]> {
        return this.embedTexts(texts, 'document');
    }

    /** Runs a guarded batch through the initialized feature-extraction pipeline. */
    private async embedTexts(
        texts: string[],
        inputType: 'document' | 'query',
    ): Promise<number[][]> {
        this.assertAvailable();
        this.activeEmbeddingOperations += 1;
        try {
            await this.initialize(false);
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
        } finally {
            this.finishEmbeddingOperation();
        }
    }
}
