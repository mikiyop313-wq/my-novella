import type {
  EmbeddingModel,
  LocalEmbeddingModelName,
  OpenRouterEmbeddingModelName,
} from './vector.model';

export interface CategoryDto {
  id: string;
  name: string;
  type: 'genre' | 'trope' | 'demographic';
  isCustom: boolean;
}

export interface BookTagDto {
  bookId: string;
  categoryId: string;
}

export interface BookSettingsDto {
  language: string;
  proseTense: 'past' | 'present';
  pointOfView: 'first' | 'second' | 'third_limited' | 'third_omni';
  synopsisAiContext: boolean;
  povCharacterId?: string | null;
  /** Embedding model/provider used to generate paragraph vectors for this book. */
  embeddingModel?: EmbeddingModel | null;
  /** Exact on-device embedding model selected when `embeddingModel` is `local`. */
  localEmbeddingModel?: LocalEmbeddingModelName | null;
  /** Exact OpenRouter model selected when `embeddingModel` is `openRouter`. */
  openRouterEmbeddingModel?: OpenRouterEmbeddingModelName | null;
  /** Global default inherited by inline manuscript prompts. */
  vectorSearchEnabled?: boolean;
  /** Whether semantic searches exclude paragraphs below the configured similarity. */
  vectorSearchThresholdEnabled?: boolean;
  /** Minimum cosine similarity accepted when threshold filtering is enabled. */
  vectorSearchSimilarityThreshold?: number;
  /** Whether semantic paragraph results must be reviewed before AI generation. */
  vectorSearchManualSelectionEnabled?: boolean;
  /** Maximum number of semantic paragraph results requested for AI context. */
  vectorSearchResultLimit?: number;
  /** Flush queued manuscript vectors after an idle delay. */
  automaticIndexingEnabled?: boolean;
}

export interface BookDto {
  id: string;
  title: string;
  author: string;
  status: 'archived' | 'draft';
  synopsis: string | null;
  coverImage: Uint8Array | string | null;
  wordCount: number;
  language: string;
  createdAt: string;
  lastEditedAt: string;
  categories?: CategoryDto[];
  settings?: BookSettingsDto;
}

export type CreateBookDto = Omit<BookDto, 'id' | 'createdAt' | 'lastEditedAt'>;
export type UpdateBookDto = Partial<CreateBookDto>;
