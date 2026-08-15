
/**
 * Selects, constructs, caches, and releases embedding providers for manuscript vector work.
 *
 * @packageDocumentation
 */

import { bookRepository } from '../../db/repositories/book.repository';
import { vectorApiKeyService } from '../../electron/domain/vector/vector-api-key.service';
import { EmbeddingProvider } from './types';
import type {
    EmbeddingModel,
    VectorCloudProviderId,
} from '../../shared/models/vector.model';
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

export { EmbeddingProviderUnavailableError } from './provider-selection';

// ---------------------------------------------------------------------------
// Provider cache — one instance per exact model to avoid re-initialising the
// heavy local ONNX pipeline for an exact model on every IPC call.
// ---------------------------------------------------------------------------

const providerCache = new Map<string, EmbeddingProvider>();
const unavailableLocalModels = new Set<LocalEmbeddingModelName>();

interface VectorApiKeyReader {
    getApiKey(providerId: VectorCloudProviderId): Promise<string | null>;
}

/** Creates the configured provider for an embedding-provider selection. */
function buildLocalProvider(
    model: EmbeddingModel,
    localModelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): EmbeddingProvider {
    if (model !== 'local') throw new EmbeddingProviderUnavailableError(model);

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

function buildCloudProvider(model: Exclude<EmbeddingModel, 'local'>, apiKey: string): EmbeddingProvider {
    switch (model) {
        case 'openAI':
            return new OpenAIEmbeddingProvider({
                type: 'openai',
                modelName: 'text-embedding-3-large',
                dimensions: 3072,
                apiKey,
            });
        case 'voyage':
            return new VoyageEmbeddingProvider({
                type: 'voyage',
                modelName: 'voyage-3',
                apiKey,
            });
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

    if (model === 'local') return getOrCreateLocalProvider(localModelName);
    return getCloudEmbeddingProvider(vectorProviderId(model));
}

/** Creates a cloud provider with the latest securely stored credential. */
export async function getCloudEmbeddingProvider(
    providerId: VectorCloudProviderId,
    keys: VectorApiKeyReader = vectorApiKeyService,
): Promise<EmbeddingProvider> {
    const model = embeddingModel(providerId);
    const apiKey = requireEmbeddingApiKey(
        model,
        (await keys.getApiKey(providerId)) ?? undefined,
    );
    return buildCloudProvider(model, apiKey);
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
    return getOrCreateLocalProvider(modelName);
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
function getOrCreateLocalProvider(
    localModelName: LocalEmbeddingModelName = LOCAL_EMBEDDING_MODEL_NAME,
): LocalEmbeddingProvider {
    if (unavailableLocalModels.has(localModelName)) {
        throw new Error('The local embedding model is being uninstalled.');
    }

    const key = providerCacheKey('local', localModelName);
    if (!providerCache.has(key)) providerCache.set(key, buildLocalProvider('local', localModelName));
    return providerCache.get(key)! as LocalEmbeddingProvider;
}

function providerCacheKey(
    model: EmbeddingModel,
    localModelName: LocalEmbeddingModelName,
): string {
    return model === 'local' ? `${model}:${localModelName}` : model;
}

function vectorProviderId(model: Exclude<EmbeddingModel, 'local'>): VectorCloudProviderId {
    return model === 'openAI' ? 'openai' : 'voyage';
}

function embeddingModel(providerId: VectorCloudProviderId): Exclude<EmbeddingModel, 'local'> {
    return providerId === 'openai' ? 'openAI' : 'voyage';
}
