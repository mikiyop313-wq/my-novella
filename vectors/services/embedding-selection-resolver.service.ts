import type { BookDto } from '../../shared/models/book.model';
import type {
  LocalEmbeddingModelStatus,
  OpenRouterEmbeddingModelName,
  ResolvedBookEmbeddingSelection,
  VectorConfigurationProviderId,
} from '../../shared/models/vector.model';
import { bookRepository } from '../../db/repositories/book.repository';
import { vectorApiKeyService } from '../../electron/domain/vector/vector-api-key.service';
import { localEmbeddingModelManager } from '../embeddings/local-model-manager';

export const DEFAULT_OPENROUTER_EMBEDDING_MODEL: OpenRouterEmbeddingModelName =
  'nvidia/nemotron-3-embed-1b:free';

interface EmbeddingSelectionRepository {
  getById(bookId: string): Promise<BookDto | undefined>;
  setEmbeddingSelection(
    bookId: string,
    selection: ResolvedBookEmbeddingSelection,
  ): Promise<void>;
}

interface EmbeddingSelectionResolverDependencies {
  repository: EmbeddingSelectionRepository;
  getLocalModelStatuses: () => Promise<LocalEmbeddingModelStatus[]>;
  getApiKey: (providerId: VectorConfigurationProviderId) => Promise<string | null>;
}

interface EmbeddingAvailability {
  localModels: LocalEmbeddingModelStatus[];
  configuredProviders: Record<VectorConfigurationProviderId, boolean>;
}

/** Selects and persists the highest-priority embedding model that is currently available. */
export class EmbeddingSelectionResolverService {
  constructor(private readonly dependencies: EmbeddingSelectionResolverDependencies) {}

  async resolveForNewBook(): Promise<ResolvedBookEmbeddingSelection> {
    const availability = await this.loadAvailability();
    return this.resolveSelection(this.emptySelection(), availability);
  }

  async resolveBooks(books: readonly BookDto[]): Promise<BookDto[]> {
    const availability = await this.loadAvailability();
    return Promise.all(books.map(book => this.resolveBook(book, availability)));
  }

  async ensureBookSelection(bookId: string): Promise<ResolvedBookEmbeddingSelection | null> {
    const book = await this.dependencies.repository.getById(bookId);
    if (!book) return null;

    const availability = await this.loadAvailability();
    const resolvedBook = await this.resolveBook(book, availability);
    return this.selectionFromBook(resolvedBook);
  }

  private async resolveBook(
    book: BookDto,
    availability: EmbeddingAvailability,
  ): Promise<BookDto> {
    const current = this.selectionFromBook(book);
    const resolved = this.resolveSelection(current, availability);
    if (!book.settings || !this.selectionsMatch(current, resolved)) {
      await this.dependencies.repository.setEmbeddingSelection(book.id, resolved);
    }

    if (!book.settings) {
      const persistedBook = await this.dependencies.repository.getById(book.id);
      if (!persistedBook) throw new Error(`Book not found: ${book.id}`);
      return persistedBook;
    }

    return {
      ...book,
      settings: { ...book.settings, ...resolved },
    };
  }

  private resolveSelection(
    current: ResolvedBookEmbeddingSelection,
    availability: EmbeddingAvailability,
  ): ResolvedBookEmbeddingSelection {
    if (this.isSelectionAvailable(current, availability)) return current;

    const firstLocalModel = availability.localModels.find(status => status.installed);
    if (firstLocalModel) {
      return {
        embeddingModel: 'local',
        localEmbeddingModel: firstLocalModel.modelName,
        openRouterEmbeddingModel: current.openRouterEmbeddingModel,
      };
    }
    if (availability.configuredProviders.openrouter) {
      return {
        embeddingModel: 'openRouter',
        localEmbeddingModel: current.localEmbeddingModel,
        openRouterEmbeddingModel: DEFAULT_OPENROUTER_EMBEDDING_MODEL,
      };
    }
    if (availability.configuredProviders.openai) {
      return { ...current, embeddingModel: 'openAI' };
    }
    if (availability.configuredProviders.voyage) {
      return { ...current, embeddingModel: 'voyage' };
    }
    return this.emptySelection();
  }

  private isSelectionAvailable(
    selection: ResolvedBookEmbeddingSelection,
    availability: EmbeddingAvailability,
  ): boolean {
    switch (selection.embeddingModel) {
      case 'local':
        return selection.localEmbeddingModel !== null
          && availability.localModels.some(status => (
            status.modelName === selection.localEmbeddingModel && status.installed
          ));
      case 'openRouter':
        return selection.openRouterEmbeddingModel !== null
          && availability.configuredProviders.openrouter;
      case 'openAI':
        return availability.configuredProviders.openai;
      case 'voyage':
        return availability.configuredProviders.voyage;
      default:
        return false;
    }
  }

  private async loadAvailability(): Promise<EmbeddingAvailability> {
    const [localModels, openRouterKey, openAiKey, voyageKey] = await Promise.all([
      this.dependencies.getLocalModelStatuses(),
      this.dependencies.getApiKey('openrouter'),
      this.dependencies.getApiKey('openai'),
      this.dependencies.getApiKey('voyage'),
    ]);
    return {
      localModels,
      configuredProviders: {
        openrouter: openRouterKey !== null,
        openai: openAiKey !== null,
        voyage: voyageKey !== null,
      },
    };
  }

  private selectionFromBook(book: BookDto): ResolvedBookEmbeddingSelection {
    return {
      embeddingModel: book.settings?.embeddingModel ?? null,
      localEmbeddingModel: book.settings?.localEmbeddingModel ?? null,
      openRouterEmbeddingModel: book.settings?.openRouterEmbeddingModel ?? null,
    };
  }

  private emptySelection(): ResolvedBookEmbeddingSelection {
    return {
      embeddingModel: null,
      localEmbeddingModel: null,
      openRouterEmbeddingModel: null,
    };
  }

  private selectionsMatch(
    left: ResolvedBookEmbeddingSelection,
    right: ResolvedBookEmbeddingSelection,
  ): boolean {
    return left.embeddingModel === right.embeddingModel
      && left.localEmbeddingModel === right.localEmbeddingModel
      && left.openRouterEmbeddingModel === right.openRouterEmbeddingModel;
  }
}

export const embeddingSelectionResolverService = new EmbeddingSelectionResolverService({
  repository: bookRepository,
  getLocalModelStatuses: () => localEmbeddingModelManager.getStatuses(),
  getApiKey: providerId => vectorApiKeyService.getApiKey(providerId),
});
