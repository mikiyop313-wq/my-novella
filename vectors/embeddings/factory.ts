
/**
 * Selects, constructs, caches, and releases embedding providers for manuscript vector work.
 *
 * @packageDocumentation
 */

import { bookRepository } from '../../db/repositories/book.repository';
import { EmbeddingProvider } from './types';
import { EmbeddingModel } from '../../shared/models/vector.model';
import type { LocalEmbeddingModelName } from '../../shared/models/vector.model';
import { LocalEmbeddingProvider } from './providers/local';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { VoyageEmbeddingProvider } from './providers/voyage';
import {
    EmbeddingProviderUnavailableError,
    requireEmbeddingApiKey,
} from './provider-selection';
import {
    getLocalEmbeddingModelPaths,
    getLocalEmbeddingModelDefinition,
    LOCAL_EMBEDDING_MODEL_NAME,
} from './local-model-definition';

// ---------------------------------------------------------------------------
// API key stub
// ---------------------------------------------------------------------------

/**
 * Retrieves the API key for a given embedding provider.
 *
 * @stub This function is a placeholder. When cloud provider support is added,
 * wire this to SecureLocalStorage (or an IPC round-trip to the renderer)
 * to retrieve the key stored by the user.
 */
export function getApiKeyForModel(_model: EmbeddingModel): string | undefined {
    return undefined;
}

export { EmbeddingProviderUnavailableError } from './provider-selection';

// ---------------------------------------------------------------------------
// Provider cache — one instance per exact model to avoid re-initialising the
// heavy local ONNX pipeline for an exact model on every IPC call.
// ---------------------------------------------------------------------------

const providerCache = new Map<string, EmbeddingProvider>();
const unavailableLocalModels = new Set<LocalEmbeddingModelName>();

/** Creates the configured provider for an embedding-provider selection. */
function buildProvider(
    model: EmbeddingModel,
    localModelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): EmbeddingProvider {
    switch (model) {
        case 'local': {
            const definition = getLocalEmbeddingModelDefinition(localModelName);
            const paths = getLocalEmbeddingModelPaths(localModelName);
            return new LocalEmbeddingProvider({
                type: 'local',
                modelName: definition.modelName,
                sourceModelName: definition.sourceModelName,
                dimensions: definition.dimensions,
                inputType: 'document',
                quantized: definition.quantized,
                cacheDir: paths.cacheDir,
                installationMarkerPath: paths.installationMarkerPath,
            });
        }

        case 'openAI': {
            const apiKey = requireEmbeddingApiKey('openAI', getApiKeyForModel('openAI'));
            return new OpenAIEmbeddingProvider({
                type: 'openai',
                modelName: 'text-embedding-3-small',
                dimensions: 1536,
                apiKey,
            });
        }

        case 'voyage': {
            const apiKey = requireEmbeddingApiKey('voyage', getApiKeyForModel('voyage'));
            return new VoyageEmbeddingProvider({
                type: 'voyage',
                modelName: 'voyage-3',
                apiKey,
            });
        }

        default:
            throw new EmbeddingProviderUnavailableError(model);
    }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Returns the cached `EmbeddingProvider` for the given book.
 *
 * Reads `embeddingModel` from `book_settings` to determine which provider
 * to use. Books without a settings row explicitly default to `local` in the
 * repository; configured API providers never fall back to local.
 *
 * The provider instance is cached for the lifetime of the main process so
 * the local ONNX pipeline is only initialised once.
 */
export async function getEmbeddingProvider(bookId: string): Promise<EmbeddingProvider> {
    const model = await bookRepository.getEmbeddingModel(bookId);
    const localModelName = model === 'local'
        ? await bookRepository.getLocalEmbeddingModel(bookId)
        : LOCAL_EMBEDDING_MODEL_NAME;

    console.log(`[EmbeddingFactory] book=${bookId} → model=${model}:${localModelName}`);

    return getOrCreateProvider(model, localModelName);
}

/**
 * Returns the cached local provider used by explicit model-management operations.
 *
 * @returns The active local embedding provider.
 * @throws Error while local model files are being uninstalled.
 */
export function getLocalEmbeddingProvider(
    modelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): LocalEmbeddingProvider {
    return getOrCreateProvider('local', modelName) as LocalEmbeddingProvider;
}

/**
 * Blocks new local-provider access, disposes the loaded pipeline, and invalidates its cache entry.
 *
 * Access remains blocked until {@link restoreLocalEmbeddingProviderAccess} is called.
 */
export async function releaseLocalEmbeddingProvider(
    modelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): Promise<void> {
    unavailableLocalModels.add(modelName);
    const key = providerCacheKey('local', modelName);
    const cached = providerCache.get(key);
    if (cached) await (cached as LocalEmbeddingProvider).dispose();
    providerCache.delete(key);
}

/** Allows a fresh local provider to be created after an uninstall operation has finished. */
export function restoreLocalEmbeddingProviderAccess(
    modelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): void {
    unavailableLocalModels.delete(modelName);
}

/** Returns a cached provider or constructs it when first requested. */
function getOrCreateProvider(
    model: EmbeddingModel,
    localModelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): EmbeddingProvider {
    if (model === 'local' && unavailableLocalModels.has(localModelName)) {
        throw new Error('The local embedding model is being uninstalled.');
    }

    const key = providerCacheKey(model, localModelName);
    if (!providerCache.has(key)) providerCache.set(key, buildProvider(model, localModelName));
    return providerCache.get(key)!;
}

function providerCacheKey(
    model: EmbeddingModel,
    localModelName: LocalEmbeddingModelName,
): string {
    return model === 'local' ? `${model}:${localModelName}` : model;
}
