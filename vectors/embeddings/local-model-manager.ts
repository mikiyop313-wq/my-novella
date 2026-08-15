/**
 * Manages installation state, cache usage, download, and uninstall for the supported local model.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';

import type {
    LocalEmbeddingModelDownloadProgress,
    LocalEmbeddingModelStatus,
    UninstallLocalEmbeddingModelPayload,
} from '../../shared/models/vector.model';
import { vectorDb } from '../lancedb.connection';
import {
    getLocalEmbeddingProvider,
    releaseLocalEmbeddingProvider,
    restoreLocalEmbeddingProviderAccess,
} from './factory';
import {
    getLocalEmbeddingModelPaths,
    LOCAL_EMBEDDING_MODEL_NAME,
    LOCAL_EMBEDDING_SPACE,
    type LocalEmbeddingModelPaths,
} from './local-model-definition';

type LifecycleOperation = 'download' | 'uninstall';

/** Minimal provider capability required to perform an explicit model download. */
export interface LocalEmbeddingModelLifecycleProvider {
    download: (
        onProgress?: (progress: LocalEmbeddingModelDownloadProgress) => void,
    ) => Promise<void>;
}

/** Injectable model lifecycle dependencies used by production code and isolated tests. */
export interface LocalEmbeddingModelManagerDependencies {
    paths: LocalEmbeddingModelPaths;
    getProvider: () => LocalEmbeddingModelLifecycleProvider;
    releaseProvider: () => Promise<void>;
    restoreProviderAccess: () => void;
    clearVectors: () => Promise<void>;
}

/** Coordinates mutually exclusive local-model lifecycle operations. */
export class LocalEmbeddingModelManager {
    private activeOperation: LifecycleOperation | null = null;

    /** Creates a manager backed by the supplied filesystem and provider operations. */
    constructor(private readonly dependencies: LocalEmbeddingModelManagerDependencies) {}

    /**
     * Reads installation state from the completion marker and totals cached model bytes.
     *
     * @returns Current status for the supported local model.
     */
    async getStatus(): Promise<LocalEmbeddingModelStatus> {
        const [installed, cachedBytes] = await Promise.all([
            pathExists(this.dependencies.paths.installationMarkerPath),
            directorySize(this.dependencies.paths.modelDir),
        ]);
        return {
            modelName: LOCAL_EMBEDDING_MODEL_NAME,
            installed,
            cachedBytes,
        };
    }

    /**
     * Downloads and initializes the model, then marks the installation complete.
     *
     * @param onProgress - Optional receiver for per-file Transformers.js progress.
     * @returns Installed model status after the marker is written.
     */
    async download(
        onProgress?: (progress: LocalEmbeddingModelDownloadProgress) => void,
    ): Promise<LocalEmbeddingModelStatus> {
        return this.runExclusive('download', async () => {
            const provider = this.dependencies.getProvider();
            await provider.download(onProgress);
            await mkdir(this.dependencies.paths.modelDir, { recursive: true });
            await writeFile(
                this.dependencies.paths.installationMarkerPath,
                LOCAL_EMBEDDING_MODEL_NAME,
                'utf8',
            );
            return this.getStatus();
        });
    }

    /**
     * Disposes the provider, removes this model's cache, and optionally drops its vector table.
     *
     * Provider creation remains blocked until filesystem and optional vector cleanup finish.
     *
     * @param payload - Selects whether vectors from this exact embedding space are also removed.
     * @returns Model status after uninstall completes.
     */
    async uninstall(
        payload: UninstallLocalEmbeddingModelPayload,
    ): Promise<LocalEmbeddingModelStatus> {
        return this.runExclusive('uninstall', async () => {
            try {
                await this.dependencies.releaseProvider();

                if (await pathExists(this.dependencies.paths.modelDir)) {
                    await rm(this.dependencies.paths.modelDir, { recursive: true });
                }

                if (payload.clearVectors) await this.dependencies.clearVectors();
                return this.getStatus();
            } finally {
                this.dependencies.restoreProviderAccess();
            }
        });
    }

    /** Runs one lifecycle operation and rejects attempts to overlap another operation. */
    private async runExclusive<T>(
        operation: LifecycleOperation,
        run: () => Promise<T>,
    ): Promise<T> {
        if (this.activeOperation) {
            throw new Error(
                `A local embedding model ${this.activeOperation} operation is already in progress.`,
            );
        }

        this.activeOperation = operation;
        try {
            return await run();
        } finally {
            this.activeOperation = null;
        }
    }
}

/** Returns whether a path exists while propagating filesystem errors other than `ENOENT`. */
async function pathExists(filePath: string): Promise<boolean> {
    try {
        await stat(filePath);
        return true;
    } catch (error) {
        if (isMissingPathError(error)) return false;
        throw error;
    }
}

/** Recursively totals regular-file bytes within a model cache directory. */
async function directorySize(directoryPath: string): Promise<number> {
    let entries;
    try {
        entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
        if (isMissingPathError(error)) return 0;
        throw error;
    }

    const sizes = await Promise.all(entries.map(async entry => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) return directorySize(entryPath);
        if (!entry.isFile()) return 0;
        return (await stat(entryPath)).size;
    }));
    return sizes.reduce((total, size) => total + size, 0);
}

/** Identifies the Node.js error used when a requested filesystem path is absent. */
function isMissingPathError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

const paths = getLocalEmbeddingModelPaths();

/** Process-wide manager used by the Electron IPC layer. */
export const localEmbeddingModelManager = new LocalEmbeddingModelManager({
    paths,
    getProvider: getLocalEmbeddingProvider,
    releaseProvider: releaseLocalEmbeddingProvider,
    restoreProviderAccess: restoreLocalEmbeddingProviderAccess,
    clearVectors: () => vectorDb.dropEmbeddingSpace(LOCAL_EMBEDDING_SPACE),
});
