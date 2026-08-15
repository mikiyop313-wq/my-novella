// ---------------------------------------------------------------------------
// Embedding model types
// ---------------------------------------------------------------------------

/** The embedding model/provider used to generate a vector. */
export type EmbeddingModel = 'local' | 'openAI' | 'voyage';

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
    model:     EmbeddingModel; // Model used for embedding
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
    deletes: ParagraphDelete[];
}

/** Payload exchanged over the `vectors:syncParagraphs` IPC channel (backward-compat). */
export interface ParagraphVectorFlush {
    /** Book that owns these paragraphs — used to resolve the embedding provider. */
    bookId:  string;
    /** Paragraphs to upsert into the vector DB (embed + store). */
    upserts: ParagraphUpsert[];
    /** Paragraphs to remove from the vector DB. */
    deletes: ParagraphDelete[];
}

