
// ---------------------------------------------------------------------------
// Embedding model types
// ---------------------------------------------------------------------------

/** The embedding model/provider used to generate a vector. */
export type EmbeddingModel = 'local' | 'openAI' | 'voyage' | 'openRouter';

export const VECTOR_CLOUD_PROVIDER_IDS = ['openai', 'voyage'] as const;

export type VectorCloudProviderId = (typeof VECTOR_CLOUD_PROVIDER_IDS)[number];

export const VECTOR_CONFIGURATION_PROVIDER_IDS = [
    ...VECTOR_CLOUD_PROVIDER_IDS,
    'openrouter',
] as const;

export type VectorConfigurationProviderId =
    (typeof VECTOR_CONFIGURATION_PROVIDER_IDS)[number];

export interface VectorApiKeyStatus {
    configured: boolean;
    suffix: string | null;
}

export interface VectorProviderConfiguration {
    apiKeys: Record<VectorConfigurationProviderId, VectorApiKeyStatus>;
}

export interface SaveVectorApiKeyRequest {
    providerId: VectorConfigurationProviderId;
    apiKey: string;
}

export interface LoadVectorApiKeyRequest {
    providerId: VectorConfigurationProviderId;
}

export interface TestVectorProviderConnectionRequest {
    providerId: VectorConfigurationProviderId;
}

/** Selects one of the fixed-model cloud providers for a book. */
export interface SelectBookCloudEmbeddingProviderPayload {
    bookId: string;
    providerId: VectorCloudProviderId;
    reindex: boolean;
}

/** Progress emitted while rebuilding a book with a fixed-model cloud provider. */
export interface BookCloudEmbeddingReindexProgress {
    bookId: string;
    providerId: VectorCloudProviderId;
    processedParagraphs: number;
    totalParagraphs: number;
}

export interface BookCloudEmbeddingSelectionOnlyResult {
    bookId: string;
    providerId: VectorCloudProviderId;
    reindexed: false;
}

export interface BookCloudEmbeddingSelectionReindexResult {
    bookId: string;
    providerId: VectorCloudProviderId;
    reindexed: true;
    totalParagraphs: number;
    reusedParagraphs: number;
    embeddedParagraphs: number;
    metadataUpdatedParagraphs: number;
    deletedParagraphs: number;
}

export type BookCloudEmbeddingSelectionResult =
    | BookCloudEmbeddingSelectionOnlyResult
    | BookCloudEmbeddingSelectionReindexResult;

/** Identifies one mutually compatible vector space. */
export interface EmbeddingSpaceDescriptor {
    provider: EmbeddingModel;
    model: string;
    dimensions: number;
    revision: string;
}

// ---------------------------------------------------------------------------
// OpenRouter embedding models
// ---------------------------------------------------------------------------

/** Curated OpenRouter embedding model identifiers supported by the backend. */
export type OpenRouterEmbeddingModelName =
    | 'voyageai/voyage-multimodal-3.5'
    | 'voyageai/voyage-4-lite'
    | 'voyageai/voyage-4'
    | 'voyageai/voyage-4-large'
    | 'google/gemini-embedding-2'
    | 'openai/text-embedding-3-large'
    | 'openai/text-embedding-3-small'
    | 'nvidia/nemotron-3-embed-1b:free'
    | 'qwen/qwen3-embedding-8b'
    | 'qwen/qwen3-embedding-4b';

/** Public metadata for one curated OpenRouter embedding model. */
export interface OpenRouterEmbeddingModelDescriptor {
    modelName: OpenRouterEmbeddingModelName;
    displayName: string;
    providerName: string;
    dimensions: number;
}

export interface SelectBookOpenRouterEmbeddingModelPayload {
    bookId: string;
    modelName: OpenRouterEmbeddingModelName;
    reindex: boolean;
}

/** The nullable OpenRouter model selection stored for a book. */
export interface BookOpenRouterEmbeddingModelSelection {
    bookId: string;
    modelName: OpenRouterEmbeddingModelName | null;
}

/** Progress emitted while rebuilding a book with an OpenRouter model. */
export interface BookOpenRouterEmbeddingReindexProgress {
    bookId: string;
    modelName: OpenRouterEmbeddingModelName;
    processedParagraphs: number;
    totalParagraphs: number;
}

export interface BookOpenRouterEmbeddingSelectionOnlyResult {
    bookId: string;
    modelName: OpenRouterEmbeddingModelName;
    reindexed: false;
}

export interface BookOpenRouterEmbeddingSelectionReindexResult {
    bookId: string;
    modelName: OpenRouterEmbeddingModelName;
    reindexed: true;
    totalParagraphs: number;
    reusedParagraphs: number;
    embeddedParagraphs: number;
    metadataUpdatedParagraphs: number;
    deletedParagraphs: number;
}

export type BookOpenRouterEmbeddingSelectionResult =
    | BookOpenRouterEmbeddingSelectionOnlyResult
    | BookOpenRouterEmbeddingSelectionReindexResult;

// ---------------------------------------------------------------------------
// LanceDB record shape
// ---------------------------------------------------------------------------

/** A single paragraph stored in the LanceDB manuscript vector table. */
export interface ManuscriptVectorRecord {
    id:        string;   // Unique identifier for this vector record (= paragraphId)
    bookId:    string;   // ID of the book
    actId:     string;   // ID of the act
    chapterId: string;   // ID of the chapter
    sceneId:   string;   // ID of the scene
    text:      string;   // The actual text content of the paragraph
    vector:    number[]; // The embedding vector

    // Metadata fields (flattened for efficient LanceDB filtering):
    provider:  EmbeddingModel; // Provider used for embedding
    model:     string;         // Exact embedding model name
    revision:  string;         // Embedding/prompt-format revision
    hash:      string;         // Hash of the paragraph text — detect modifications
    position:  number;         // Zero-based order in the scene prose
    charCount: number;         // Character count, useful for context-limit management
    createdAt: number;         // Unix ms timestamp of creation
    updatedAt: number;         // Unix ms timestamp of last update
}

// ---------------------------------------------------------------------------
// IPC payload shapes
// ---------------------------------------------------------------------------

/** A paragraph that was created or modified — needs a vector upsert. */
export interface ParagraphUpsert {
    paragraphId: string;
    sceneId:     string;
    /** Plain-text content of the paragraph (used for embedding). */
    text:        string;
    /** djb2 hash of `text` — lets the vector layer skip unchanged paragraphs. */
    hash:        string;
    /** Zero-based order of the paragraph within its scene prose. */
    position:    number;
}

/** A paragraph that was removed — needs a vector delete. */
export interface ParagraphDelete {
    paragraphId: string;
    sceneId:     string;
}

/** Payload for `vectors:upsertParagraphs` IPC handler. */
export interface UpsertParagraphsPayload {
    bookId:  string;
    upserts: ParagraphUpsert[];
}

/** Payload for `vectors:deleteParagraphs` IPC handler. */
export interface DeleteParagraphsPayload {
    bookId: string;
    deletes: ParagraphDelete[];
}

/** Per-book configuration used by manuscript paragraph-vector synchronization. */
export interface BookIndexingConfiguration {
    available: boolean;
    automaticIndexingEnabled: boolean;
}

/** Estimated logical storage used by one book in one retained embedding space. */
export interface BookVectorIndexSize {
    provider: EmbeddingModel;
    model: string;
    paragraphCount: number;
    estimatedBytes: number;
}

/** Identifies one retained model index to clear for a book. */
export interface ClearBookVectorIndexPayload {
    bookId: string;
    provider: EmbeddingModel;
    model: string;
}

export interface SearchSimilarParagraphsPayload {
    bookId: string;
    query: string;
    limit?: number;
}

export interface SimilarParagraphResult {
    paragraphId: string;
    actId: string;
    chapterId: string;
    sceneId: string;
    text: string;
    distance: number;
}

/**
 * Defines the shared vector-search records, embedding-space identifiers, and IPC contracts.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Local embedding model management
// ---------------------------------------------------------------------------

/** Canonical identifiers accepted by local-model lifecycle IPC operations. */
export type LocalEmbeddingModelName =
    | 'mixedbread-ai/mxbai-embed-large-v1'
    | 'BAAI/bge-large-en-v1.5'
    | 'BAAI/bge-m3'
    | 'nomic-ai/nomic-embed-text-v1.5'
    | 'BAAI/bge-base-en-v1.5'
    | 'Alibaba-NLP/gte-multilingual-base'
    | 'BAAI/bge-small-en-v1.5'
    | 'sentence-transformers/all-MiniLM-L6-v2'
    | 'Snowflake/snowflake-arctic-embed-xs';

export type LocalEmbeddingModelTier = 'large' | 'medium' | 'small';

/** Public catalog metadata for one supported local embedding model. */
export interface LocalEmbeddingModelDescriptor {
    modelName: LocalEmbeddingModelName;
    displayName: string;
    providerName: string;
    providerInitials: string;
    tier: LocalEmbeddingModelTier;
    dimensions: number;
    language: string;
}

/** Describes whether one managed local model is installed and how much cache space it uses. */
export interface LocalEmbeddingModelStatus extends LocalEmbeddingModelDescriptor {
    installed: boolean;
    cachedBytes: number;
    /** Number of books that currently select this exact local model. */
    selectedBookCount: number;
}

/** Lifecycle events emitted by Transformers.js while preparing a model. */
export type LocalEmbeddingModelDownloadStatus =
    | 'initiate'
    | 'download'
    | 'progress'
    | 'done'
    | 'ready';

/** Progress information for one file involved in a local-model download. */
export interface LocalEmbeddingModelDownloadProgress {
    modelName: LocalEmbeddingModelName;
    file: string;
    status: LocalEmbeddingModelDownloadStatus;
    loaded?: number;
    total?: number;
    progress?: number;
}

/** Selects the supported model to download. */
export interface DownloadLocalEmbeddingModelPayload {
    modelName: LocalEmbeddingModelName;
}

/** Options accepted by the local-model uninstall IPC operation. */
export interface UninstallLocalEmbeddingModelPayload extends DownloadLocalEmbeddingModelPayload {
    clearVectors: boolean;
}

/** Selects one installed local model for a book and optionally reconciles its vector index. */
export interface SelectBookLocalEmbeddingModelPayload extends DownloadLocalEmbeddingModelPayload {
    bookId: string;
    reindex: boolean;
}

/** Identifies the exact local model currently selected by a book. */
export interface BookLocalEmbeddingModelSelection {
    bookId: string;
    modelName: LocalEmbeddingModelName;
}

/** Progress emitted while a book is reconciled into a newly selected local embedding space. */
export interface BookEmbeddingReindexProgress extends BookLocalEmbeddingModelSelection {
    processedParagraphs: number;
    totalParagraphs: number;
}

/** Summary of one complete book reconciliation. */
export interface BookEmbeddingReindexResult extends BookLocalEmbeddingModelSelection {
    totalParagraphs: number;
    reusedParagraphs: number;
    embeddedParagraphs: number;
    metadataUpdatedParagraphs: number;
    deletedParagraphs: number;
}

/** Result returned when a book model selection does not require reconciliation. */
export interface BookEmbeddingSelectionOnlyResult extends BookLocalEmbeddingModelSelection {
    reindexed: false;
}

/** Result returned after selecting and reconciling a book embedding model. */
export interface BookEmbeddingSelectionReindexResult extends BookEmbeddingReindexResult {
    reindexed: true;
}

/** Tagged result for a per-book local embedding model selection. */
export type BookEmbeddingSelectionResult =
    | BookEmbeddingSelectionOnlyResult
    | BookEmbeddingSelectionReindexResult;
