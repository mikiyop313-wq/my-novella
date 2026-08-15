/** Verifies local model cache status, installation, uninstall, and lifecycle exclusion. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';

vi.mock('electron', () => ({
    app: { getPath: () => tmpdir() },
}));

vi.mock('../factory', () => ({
    getLocalEmbeddingProvider: vi.fn(),
    releaseLocalEmbeddingProvider: vi.fn(),
    restoreLocalEmbeddingProviderAccess: vi.fn(),
}));

vi.mock('../../lancedb.connection', () => ({
    vectorDb: { dropEmbeddingSpace: vi.fn() },
}));

import {
    LocalEmbeddingModelManager,
    type LocalEmbeddingModelManagerDependencies,
} from '../local-model-manager';
import { LOCAL_EMBEDDING_MODEL_NAME } from '../local-model-definition';

describe('LocalEmbeddingModelManager', () => {
    let temporaryRoot: string;
    let dependencies: LocalEmbeddingModelManagerDependencies;
    let manager: LocalEmbeddingModelManager;

    beforeEach(async () => {
        temporaryRoot = await mkdtemp(path.join(tmpdir(), 'my-novella-model-'));
        const cacheDir = path.join(temporaryRoot, 'models');
        const modelDir = path.join(cacheDir, 'mixedbread-ai', 'mxbai-embed-large-v1');
        dependencies = {
            paths: {
                cacheDir,
                modelDir,
                installationMarkerPath: path.join(modelDir, '.installed'),
            },
            getProvider: () => ({ download: vi.fn().mockResolvedValue(undefined) }),
            releaseProvider: vi.fn().mockResolvedValue(undefined),
            restoreProviderAccess: vi.fn(),
            clearVectors: vi.fn().mockResolvedValue(undefined),
        };
        manager = new LocalEmbeddingModelManager(dependencies);
    });

    afterEach(async () => {
        await rm(temporaryRoot, { recursive: true, force: true });
    });

    it('distinguishes absent, partial, and installed caches and reports their size', async () => {
        await expect(manager.getStatus()).resolves.toEqual({
            modelName: LOCAL_EMBEDDING_MODEL_NAME,
            installed: false,
            cachedBytes: 0,
        });

        await mkdir(dependencies.paths.modelDir, { recursive: true });
        await writeFile(path.join(dependencies.paths.modelDir, 'model.onnx'), '12345');
        await expect(manager.getStatus()).resolves.toEqual({
            modelName: LOCAL_EMBEDDING_MODEL_NAME,
            installed: false,
            cachedBytes: 5,
        });

        await writeFile(dependencies.paths.installationMarkerPath, 'ok');
        await expect(manager.getStatus()).resolves.toEqual({
            modelName: LOCAL_EMBEDDING_MODEL_NAME,
            installed: true,
            cachedBytes: 7,
        });
    });

    it('writes the completion marker only after a successful download', async () => {
        const progress = vi.fn();
        const download = vi.fn(async onProgress => {
            onProgress?.({ status: 'progress', file: 'model.onnx', progress: 50 });
        });
        dependencies.getProvider = () => ({ download });
        manager = new LocalEmbeddingModelManager(dependencies);

        const status = await manager.download(progress);

        expect(progress).toHaveBeenCalledWith({
            status: 'progress',
            file: 'model.onnx',
            progress: 50,
        });
        expect(await readFile(dependencies.paths.installationMarkerPath, 'utf8')).toBe(
            LOCAL_EMBEDDING_MODEL_NAME,
        );
        expect(status.installed).toBe(true);
    });

    it('leaves a failed download uninstalled and permits a retry', async () => {
        const download = vi.fn()
            .mockRejectedValueOnce(new Error('network failed'))
            .mockResolvedValueOnce(undefined);
        dependencies.getProvider = () => ({ download });
        manager = new LocalEmbeddingModelManager(dependencies);

        await expect(manager.download()).rejects.toThrow('network failed');
        await expect(manager.getStatus()).resolves.toMatchObject({ installed: false });
        await expect(manager.download()).resolves.toMatchObject({ installed: true });
    });

    it('removes only the target model directory and preserves vectors by default', async () => {
        const siblingModel = path.join(dependencies.paths.cacheDir, 'other-model', 'weights.bin');
        await mkdir(dependencies.paths.modelDir, { recursive: true });
        await mkdir(path.dirname(siblingModel), { recursive: true });
        await writeFile(dependencies.paths.installationMarkerPath, 'ok');
        await writeFile(siblingModel, 'keep');

        const status = await manager.uninstall({ clearVectors: false });

        expect(dependencies.releaseProvider).toHaveBeenCalledOnce();
        expect(dependencies.restoreProviderAccess).toHaveBeenCalledOnce();
        expect(dependencies.clearVectors).not.toHaveBeenCalled();
        expect(await readFile(siblingModel, 'utf8')).toBe('keep');
        expect(status).toMatchObject({ installed: false, cachedBytes: 0 });
    });

    it('clears the local vector space only when requested', async () => {
        await manager.uninstall({ clearVectors: true });
        expect(dependencies.clearVectors).toHaveBeenCalledOnce();
    });

    it('rejects conflicting lifecycle operations', async () => {
        let finishDownload!: () => void;
        const pending = new Promise<void>(resolve => {
            finishDownload = resolve;
        });
        dependencies.getProvider = () => ({ download: () => pending });
        manager = new LocalEmbeddingModelManager(dependencies);

        const download = manager.download();
        await expect(manager.uninstall({ clearVectors: false })).rejects.toThrow(
            'download operation is already in progress',
        );
        finishDownload();
        await download;
    });
});
