/**
 * Selects, constructs, caches, and releases embedding providers for manuscript vector work.
 *
 * @packageDocumentation
 */

import { bookRepository } from '../../db/repositories/book.repository';
import { EmbeddingProvider } from './types';
import { EmbeddingModel } from '../../shared/models/vector.model';
import { LocalEmbeddingProvider } from './providers/local';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { VoyageEmbeddingProvider } from './providers/voyage';
import {
    EmbeddingProviderUnavailableError,
    requireEmbeddingApiKey,
} from './provider-selection';
import {
    getLocalEmbeddingModelPaths,
    LOCAL_EMBEDDING_MODEL_DIMENSIONS,
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
// Provider cache — one instance per model type to avoid re-initialising the
// heavy local ONNX pipeline on every IPC call.
// ---------------------------------------------------------------------------

const providerCache = new Map<EmbeddingModel, EmbeddingProvider>();
let localProviderUnavailable = false;

const localModelPaths = getLocalEmbeddingModelPaths();

/** Creates the configured provider for an embedding-provider selection. */
function buildProvider(model: EmbeddingModel): EmbeddingProvider {
    switch (model) {
        case 'local':
            return new LocalEmbeddingProvider({
                type: 'local',
                modelName: LOCAL_EMBEDDING_MODEL_NAME,
                dimensions: LOCAL_EMBEDDING_MODEL_DIMENSIONS,
                inputType: 'document',
                cacheDir: localModelPaths.cacheDir,
                installationMarkerPath: localModelPaths.installationMarkerPath,
            });

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
    // Read the book's embedding model preference using the book repository.
    const model = await bookRepository.getEmbeddingModel(bookId);

    console.log(`[EmbeddingFactory] book=${bookId} → model=${model}`);

    return getOrCreateProvider(model);
}

/**
 * Returns the cached local provider used by explicit model-management operations.
 *
 * @returns The active local embedding provider.
 * @throws Error while local model files are being uninstalled.
 */
export function getLocalEmbeddingProvider(): LocalEmbeddingProvider {
    return getOrCreateProvider('local') as LocalEmbeddingProvider;
}

/**
 * Blocks new local-provider access, disposes the loaded pipeline, and invalidates its cache entry.
 *
 * Access remains blocked until {@link restoreLocalEmbeddingProviderAccess} is called.
 */
export async function releaseLocalEmbeddingProvider(): Promise<void> {
    localProviderUnavailable = true;
    const cached = providerCache.get('local');
    if (cached) await (cached as LocalEmbeddingProvider).dispose();
    providerCache.delete('local');
}

/** Allows a fresh local provider to be created after an uninstall operation has finished. */
export function restoreLocalEmbeddingProviderAccess(): void {
    localProviderUnavailable = false;
}

/** Returns a cached provider or constructs it when first requested. */
function getOrCreateProvider(model: EmbeddingModel): EmbeddingProvider {
    if (model === 'local' && localProviderUnavailable) {
        throw new Error('The local embedding model is being uninstalled.');
    }

    if (!providerCache.has(model)) providerCache.set(model, buildProvider(model));
    return providerCache.get(model)!;
}
