// ---------------------------------------------------------------------------
// Embedding model types
// ---------------------------------------------------------------------------

/** The embedding model/provider used to generate a vector. */
export type EmbeddingModel = 'local' | 'openAI' | 'voyage';

/** Identifies one mutually compatible vector space. */
export interface EmbeddingSpaceDescriptor {
    provider: EmbeddingModel;
    model: string;
    dimensions: number;
    revision: string;
}

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

/** Describes whether the managed local model is installed and how much cache space it uses. */
export interface LocalEmbeddingModelStatus {
    modelName: string;
    installed: boolean;
    cachedBytes: number;
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
    file: string;
    status: LocalEmbeddingModelDownloadStatus;
    loaded?: number;
    total?: number;
    progress?: number;
}

/** Options accepted by the local-model uninstall IPC operation. */
export interface UninstallLocalEmbeddingModelPayload {
    clearVectors: boolean;
}

