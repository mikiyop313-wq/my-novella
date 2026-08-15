/**
 * Manages installation state, cache usage, download, and uninstall for the supported local model.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';

import type {
  DownloadLocalEmbeddingModelPayload,
  LocalEmbeddingModelDownloadProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  UninstallLocalEmbeddingModelPayload,
} from '../../shared/models/vector.model';
import { vectorDb } from '../lancedb.connection';
import { releaseLocalEmbeddingProvider, restoreLocalEmbeddingProviderAccess } from './factory';
import { LocalEmbeddingProvider } from './providers/local';
import {
  getLocalEmbeddingModelPaths,
  LOCAL_EMBEDDING_MODELS,
  type LocalEmbeddingModelDefinition,
  type LocalEmbeddingModelPaths,
} from './local-model-definition';

type LifecycleOperation = 'download' | 'uninstall';

/** Minimal provider capability required to perform an explicit model download. */
export interface LocalEmbeddingModelLifecycleProvider {
  download: (
    onProgress?: (progress: Omit<LocalEmbeddingModelDownloadProgress, 'modelName'>) => void,
  ) => Promise<void>;
  dispose: () => Promise<void>;
}

/** Injectable model lifecycle dependencies used by production code and isolated tests. */
export interface LocalEmbeddingModelManagerDependencies {
  models: readonly LocalEmbeddingModelDefinition[];
  getPaths: (modelName: LocalEmbeddingModelName) => LocalEmbeddingModelPaths;
  createProvider: (model: LocalEmbeddingModelDefinition) => LocalEmbeddingModelLifecycleProvider;
  releaseProvider: (modelName: LocalEmbeddingModelName) => Promise<void>;
  restoreProviderAccess: (modelName: LocalEmbeddingModelName) => void;
  clearVectors: (model: LocalEmbeddingModelDefinition) => Promise<void>;
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
  async getStatuses(): Promise<LocalEmbeddingModelStatus[]> {
    return Promise.all(this.dependencies.models.map((model) => this.getStatus(model.modelName)));
  }

  /** Reads installation state and cache usage for one supported model. */
  async getStatus(modelName: LocalEmbeddingModelName | string): Promise<LocalEmbeddingModelStatus> {
    const model = this.requireModel(modelName);
    const paths = this.dependencies.getPaths(model.modelName);
    const [installed, cachedBytes] = await Promise.all([
      pathExists(paths.installationMarkerPath),
      directorySize(paths.modelDir),
    ]);
    return {
      modelName: model.modelName,
      displayName: model.displayName,
      providerName: model.providerName,
      providerInitials: model.providerInitials,
      tier: model.tier,
      dimensions: model.dimensions,
      language: model.language,
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
    payload: DownloadLocalEmbeddingModelPayload,
    onProgress?: (progress: LocalEmbeddingModelDownloadProgress) => void,
  ): Promise<LocalEmbeddingModelStatus> {
    return this.runExclusive('download', async () => {
      const model = this.requireModel(payload.modelName);
      const paths = this.dependencies.getPaths(model.modelName);
      const provider = this.dependencies.createProvider(model);
      try {
        await provider.download((progress) =>
          onProgress?.({
            ...progress,
            modelName: model.modelName,
          }),
        );
      } finally {
        await provider.dispose();
      }
      await mkdir(paths.modelDir, { recursive: true });
      await writeFile(paths.installationMarkerPath, model.modelName, 'utf8');
      return this.getStatus(model.modelName);
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
      const model = this.requireModel(payload.modelName);
      const paths = this.dependencies.getPaths(model.modelName);
      try {
        await this.dependencies.releaseProvider(model.modelName);

        if (await pathExists(paths.modelDir)) {
          await rm(paths.modelDir, { recursive: true });
        }

        if (payload.clearVectors) await this.dependencies.clearVectors(model);
        return this.getStatus(model.modelName);
      } finally {
        this.dependencies.restoreProviderAccess(model.modelName);
      }
    });
  }

  /** Resolves a model only from the manager's configured registry. */
  private requireModel(modelName: LocalEmbeddingModelName | string): LocalEmbeddingModelDefinition {
    const model = this.dependencies.models.find((candidate) => candidate.modelName === modelName);
    if (!model) throw new Error(`Unsupported local embedding model: ${modelName}`);
    return model;
  }

  /** Runs one lifecycle operation and rejects attempts to overlap another operation. */
  private async runExclusive<T>(operation: LifecycleOperation, run: () => Promise<T>): Promise<T> {
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

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return directorySize(entryPath);
      if (!entry.isFile()) return 0;
      return (await stat(entryPath)).size;
    }),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

/** Identifies the Node.js error used when a requested filesystem path is absent. */
function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Process-wide manager used by the Electron IPC layer. */
export const localEmbeddingModelManager = new LocalEmbeddingModelManager({
  models: LOCAL_EMBEDDING_MODELS,
  getPaths: getLocalEmbeddingModelPaths,
  createProvider: (model) => {
    const paths = getLocalEmbeddingModelPaths(model.modelName);
    return new LocalEmbeddingProvider({
      type: 'local',
      modelName: model.modelName,
      sourceModelName: model.sourceModelName,
      dimensions: model.dimensions,
      inputType: 'document',
      quantized: model.quantized,
      cacheDir: paths.cacheDir,
      installationMarkerPath: paths.installationMarkerPath,
    });
  },
  releaseProvider: releaseLocalEmbeddingProvider,
  restoreProviderAccess: restoreLocalEmbeddingProviderAccess,
  clearVectors: (model) => vectorDb.dropEmbeddingSpace(model.space),
});
