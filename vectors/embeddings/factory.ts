import * as path from 'path';
import { app } from 'electron';
import { bookRepository } from '../../db/repositories/book.repository';
import { EmbeddingProvider } from './types';
import { EmbeddingModel } from '../../shared/models/vector.model';
import { LocalEmbeddingProvider } from './providers/local';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { VoyageEmbeddingProvider } from './providers/voyage';

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

// ---------------------------------------------------------------------------
// Provider cache — one instance per model type to avoid re-initialising the
// heavy local ONNX pipeline on every IPC call.
// ---------------------------------------------------------------------------

const providerCache = new Map<EmbeddingModel, EmbeddingProvider>();

const modelCacheDir = path.join(app.getPath('userData'), 'models');

function buildProvider(model: EmbeddingModel): EmbeddingProvider {
    switch (model) {
        case 'local':
            return new LocalEmbeddingProvider({
                type: 'local',
                modelName: 'mixedbread-ai/mxbai-embed-large-v1',
                dimensions: 1024,
                inputType: 'document',
                cacheDir: modelCacheDir,
            });

        case 'openAI': {
            const apiKey = getApiKeyForModel('openAI');
            if (!apiKey) {
                console.warn('[EmbeddingFactory] No API key for OpenAI — falling back to local provider.');
                return buildProvider('local');
            }
            return new OpenAIEmbeddingProvider({
                type: 'openai',
                modelName: 'text-embedding-3-small',
                dimensions: 1536,
                apiKey,
            });
        }

        case 'voyage': {
            const apiKey = getApiKeyForModel('voyage');
            if (!apiKey) {
                console.warn('[EmbeddingFactory] No API key for Voyage — falling back to local provider.');
                return buildProvider('local');
            }
            return new VoyageEmbeddingProvider({
                type: 'voyage',
                modelName: 'voyage-3',
                apiKey,
            });
        }

        default:
            console.warn(`[EmbeddingFactory] Unknown model "${model}" — falling back to local provider.`);
            return buildProvider('local');
    }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Returns the cached `EmbeddingProvider` for the given book.
 *
 * Reads `embeddingModel` from `book_settings` to determine which provider
 * to use. Falls back to `'local'` if the book has no settings row.
 *
 * The provider instance is cached for the lifetime of the main process so
 * the local ONNX pipeline is only initialised once.
 */
export async function getEmbeddingProvider(bookId: string): Promise<EmbeddingProvider> {
    // Read the book's embedding model preference using the book repository.
    const model = await bookRepository.getEmbeddingModel(bookId);

    console.log(`[EmbeddingFactory] book=${bookId} → model=${model}`);

    if (!providerCache.has(model)) {
        providerCache.set(model, buildProvider(model));
    }

    return providerCache.get(model)!;
}
