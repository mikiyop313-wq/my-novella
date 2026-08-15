/** Verifies per-model cache status, installation, uninstall, and lifecycle exclusion. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';

import type { LocalEmbeddingModelName } from '../../../shared/models/vector.model';

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
}));

vi.mock('../factory', () => ({
  releaseLocalEmbeddingProvider: vi.fn(),
  restoreLocalEmbeddingProviderAccess: vi.fn(),
}));

vi.mock('../../lancedb.connection', () => ({
  vectorDb: { dropEmbeddingSpace: vi.fn() },
}));

vi.mock('../../../db/repositories/book.repository', () => ({
  bookRepository: { countBooksUsingLocalEmbeddingModel: vi.fn() },
}));

import {
  LocalEmbeddingModelManager,
  type LocalEmbeddingModelManagerDependencies,
  type LocalEmbeddingModelLifecycleProvider,
} from '../local-model-manager';
import { LOCAL_EMBEDDING_MODELS, type LocalEmbeddingModelPaths } from '../local-model-definition';

describe('LocalEmbeddingModelManager', () => {
  const [mixedbread, bgeLarge] = LOCAL_EMBEDDING_MODELS;
  let temporaryRoot: string;
  let pathsByModel: Map<LocalEmbeddingModelName, LocalEmbeddingModelPaths>;
  let provider: LocalEmbeddingModelLifecycleProvider;
  let dependencies: LocalEmbeddingModelManagerDependencies;
  let manager: LocalEmbeddingModelManager;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'my-novella-model-'));
    pathsByModel = new Map(
      LOCAL_EMBEDDING_MODELS.map((model) => {
        const cacheDir = path.join(temporaryRoot, 'models');
        const modelDir = path.join(cacheDir, ...model.sourceModelName.split('/'));
        return [
          model.modelName,
          {
            cacheDir,
            modelDir,
            installationMarkerPath: path.join(modelDir, '.installed'),
          },
        ];
      }),
    );
    provider = {
      download: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    dependencies = {
      models: LOCAL_EMBEDDING_MODELS,
      getPaths: (modelName) => pathsByModel.get(modelName)!,
      createProvider: vi.fn(() => provider),
      releaseProvider: vi.fn().mockResolvedValue(undefined),
      restoreProviderAccess: vi.fn(),
      clearVectors: vi.fn().mockResolvedValue(undefined),
      countSelectedBooks: vi.fn().mockResolvedValue(0),
    };
    manager = new LocalEmbeddingModelManager(dependencies);
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('reports independent absent, partial, and installed model statuses', async () => {
    const mixedbreadPaths = pathsByModel.get(mixedbread.modelName)!;
    await mkdir(mixedbreadPaths.modelDir, { recursive: true });
    await writeFile(path.join(mixedbreadPaths.modelDir, 'model.onnx'), '12345');
    await writeFile(mixedbreadPaths.installationMarkerPath, mixedbread.modelName);

    const statuses = await manager.getStatuses();

    expect(statuses).toHaveLength(9);
    expect(statuses[0]).toMatchObject({
      modelName: mixedbread.modelName,
      installed: true,
      cachedBytes: 5 + mixedbread.modelName.length,
      selectedBookCount: 0,
    });
    expect(statuses[1]).toMatchObject({
      modelName: bgeLarge.modelName,
      installed: false,
      cachedBytes: 0,
    });
  });

  it('checks installation from the completion marker without scanning cache contents', async () => {
    const paths = pathsByModel.get(mixedbread.modelName)!;

    await expect(manager.isInstalled(mixedbread.modelName)).resolves.toBe(false);
    await mkdir(paths.modelDir, { recursive: true });
    await writeFile(paths.installationMarkerPath, mixedbread.modelName);
    await expect(manager.isInstalled(mixedbread.modelName)).resolves.toBe(true);
  });

  it('downloads the selected model, tags progress, disposes it, then writes its marker', async () => {
    const progress = vi.fn();
    provider.download = vi.fn(async (onProgress) => {
      onProgress?.({ status: 'progress', file: 'model.onnx', progress: 50 });
    });

    const status = await manager.download({ modelName: bgeLarge.modelName }, progress);
    const paths = pathsByModel.get(bgeLarge.modelName)!;

    expect(dependencies.createProvider).toHaveBeenCalledWith(bgeLarge);
    expect(progress).toHaveBeenCalledWith({
      modelName: bgeLarge.modelName,
      status: 'progress',
      file: 'model.onnx',
      progress: 50,
    });
    expect(provider.dispose).toHaveBeenCalledOnce();
    expect(await readFile(paths.installationMarkerPath, 'utf8')).toBe(bgeLarge.modelName);
    expect(status.installed).toBe(true);
  });

  it('leaves a failed download uninstalled, disposes the provider, and permits retry', async () => {
    provider.download = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(undefined);

    await expect(manager.download({ modelName: mixedbread.modelName })).rejects.toThrow(
      'network failed',
    );
    await expect(manager.getStatus(mixedbread.modelName)).resolves.toMatchObject({
      installed: false,
    });
    await expect(manager.download({ modelName: mixedbread.modelName })).resolves.toMatchObject({
      installed: true,
    });
    expect(provider.dispose).toHaveBeenCalledTimes(2);
  });

  it('cooperatively cancels a download, removes partial files, and permits retry', async () => {
    const paths = pathsByModel.get(mixedbread.modelName)!;
    let reportProgress!: () => void;
    provider.download = vi.fn(
      (onProgress) =>
        new Promise<void>((_resolve, reject) => {
          reportProgress = () => {
            try {
              onProgress?.({ status: 'progress', file: 'model.onnx', progress: 50 });
            } catch (error) {
              reject(error);
            }
          };
        }),
    );
    await mkdir(paths.modelDir, { recursive: true });
    await writeFile(path.join(paths.modelDir, 'partial.onnx'), 'partial');

    const download = manager.download({ modelName: mixedbread.modelName });
    const cancellation = manager.cancelActiveDownload();
    reportProgress();

    await expect(download).rejects.toThrow('Download cancelled');
    await expect(cancellation).resolves.toBeUndefined();
    await expect(manager.getStatus(mixedbread.modelName)).resolves.toMatchObject({
      installed: false,
      cachedBytes: 0,
    });

    provider.download = vi.fn().mockResolvedValue(undefined);
    await expect(manager.download({ modelName: mixedbread.modelName })).resolves.toMatchObject({
      installed: true,
    });
  });

  it('treats cancellation without an active download as a no-op', async () => {
    await expect(manager.cancelActiveDownload()).resolves.toBeUndefined();
  });

  it('cleans incomplete model directories while preserving completed installations', async () => {
    const incompletePaths = pathsByModel.get(mixedbread.modelName)!;
    const installedPaths = pathsByModel.get(bgeLarge.modelName)!;
    await mkdir(incompletePaths.modelDir, { recursive: true });
    await mkdir(installedPaths.modelDir, { recursive: true });
    await writeFile(path.join(incompletePaths.modelDir, 'partial.onnx'), 'partial');
    await writeFile(path.join(installedPaths.modelDir, 'model.onnx'), 'complete');
    await writeFile(installedPaths.installationMarkerPath, bgeLarge.modelName);

    await manager.cleanupIncompleteDownloads();

    await expect(manager.getStatus(mixedbread.modelName)).resolves.toMatchObject({
      installed: false,
      cachedBytes: 0,
    });
    await expect(manager.getStatus(bgeLarge.modelName)).resolves.toMatchObject({
      installed: true,
      cachedBytes: 8 + bgeLarge.modelName.length,
    });
  });

  it('removes only the selected model directory and preserves sibling caches', async () => {
    const mixedbreadPaths = pathsByModel.get(mixedbread.modelName)!;
    const bgePaths = pathsByModel.get(bgeLarge.modelName)!;
    await mkdir(mixedbreadPaths.modelDir, { recursive: true });
    await mkdir(bgePaths.modelDir, { recursive: true });
    await writeFile(mixedbreadPaths.installationMarkerPath, mixedbread.modelName);
    await writeFile(path.join(bgePaths.modelDir, 'keep.bin'), 'keep');

    const status = await manager.uninstall({
      modelName: mixedbread.modelName,
      clearVectors: false,
    });

    expect(dependencies.releaseProvider).toHaveBeenCalledWith(mixedbread.modelName);
    expect(dependencies.restoreProviderAccess).toHaveBeenCalledWith(mixedbread.modelName);
    expect(dependencies.clearVectors).not.toHaveBeenCalled();
    expect(await readFile(path.join(bgePaths.modelDir, 'keep.bin'), 'utf8')).toBe('keep');
    expect(status).toMatchObject({ installed: false, cachedBytes: 0 });
  });

  it('clears only the selected model vector space when requested', async () => {
    await manager.uninstall({ modelName: bgeLarge.modelName, clearVectors: true });
    expect(dependencies.clearVectors).toHaveBeenCalledWith(bgeLarge);
  });

  it('allows uninstall while the selected model is used by books', async () => {
    vi.mocked(dependencies.countSelectedBooks).mockResolvedValueOnce(2);

    await expect(manager.uninstall({
      modelName: bgeLarge.modelName,
      clearVectors: false,
    })).resolves.toMatchObject({
      modelName: bgeLarge.modelName,
      installed: false,
      selectedBookCount: 2,
    });
    expect(dependencies.releaseProvider).toHaveBeenCalledWith(bgeLarge.modelName);
  });

  it('rejects unsupported model identifiers', async () => {
    await expect(manager.getStatus('unknown/model')).rejects.toThrow(
      'Unsupported local embedding model: unknown/model',
    );
  });

  it('rejects conflicting lifecycle operations across models', async () => {
    let finishDownload!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    provider.download = vi.fn(() => pending);

    const download = manager.download({ modelName: mixedbread.modelName });
    await expect(
      manager.uninstall({
        modelName: bgeLarge.modelName,
        clearVectors: false,
      }),
    ).rejects.toThrow('download operation is already in progress');
    finishDownload();
    await download;
  });
});
