/**
 * Centralizes the supported local embedding model's identity, vector space, and cache paths.
 *
 * @packageDocumentation
 */

import { app } from 'electron';
import * as path from 'path';

import type { EmbeddingSpaceDescriptor } from '../../shared/models/vector.model';

/** Hugging Face repository identifier for the supported local model. */
export const LOCAL_EMBEDDING_MODEL_NAME = 'mixedbread-ai/mxbai-embed-large-v1';
/** Number of values produced by the supported local model. */
export const LOCAL_EMBEDDING_MODEL_DIMENSIONS = 1024;
/** Application-level revision used to isolate compatible local vectors. */
export const LOCAL_EMBEDDING_MODEL_REVISION = '1';

/** Complete descriptor used to address this model's LanceDB table. */
export const LOCAL_EMBEDDING_SPACE: EmbeddingSpaceDescriptor = {
    provider: 'local',
    model: LOCAL_EMBEDDING_MODEL_NAME,
    dimensions: LOCAL_EMBEDDING_MODEL_DIMENSIONS,
    revision: LOCAL_EMBEDDING_MODEL_REVISION,
};

/** Filesystem locations used by Transformers.js and the installation lifecycle. */
export interface LocalEmbeddingModelPaths {
    cacheDir: string;
    modelDir: string;
    installationMarkerPath: string;
}

/**
 * Resolves the managed model's paths inside Electron's writable user-data directory.
 *
 * @returns Cache root, model directory, and installation-marker path.
 */
export function getLocalEmbeddingModelPaths(): LocalEmbeddingModelPaths {
    const cacheDir = path.join(app.getPath('userData'), 'models');
    const modelDir = path.join(cacheDir, ...LOCAL_EMBEDDING_MODEL_NAME.split('/'));
    return {
        cacheDir,
        modelDir,
        installationMarkerPath: path.join(modelDir, '.installed'),
    };
}
