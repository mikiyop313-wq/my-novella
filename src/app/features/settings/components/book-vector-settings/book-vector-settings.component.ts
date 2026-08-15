import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import type { BookDto, BookSettingsDto } from '../../../../../../shared/models/book.model';
import type {
  BookCloudEmbeddingReindexProgress,
  BookEmbeddingReindexProgress,
  BookLocalEmbeddingModelSelection,
  BookOpenRouterEmbeddingModelSelection,
  BookOpenRouterEmbeddingReindexProgress,
  BookVectorIndexSize,
  ClearBookVectorIndexPayload,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  OpenRouterEmbeddingModelDescriptor,
  OpenRouterEmbeddingModelName,
  SelectBookCloudEmbeddingProviderPayload,
  SelectBookLocalEmbeddingModelPayload,
  SelectBookOpenRouterEmbeddingModelPayload,
  VectorApiKeyStatus,
  VectorCloudProviderId,
  VectorConfigurationProviderId,
  VectorProviderConfiguration,
} from '../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../shared/components/confirm-modal/confirm-modal.service';
import { LibraryService } from '../../../library/services/library.service';
import { LocalEmbeddingModelStateService } from '../../services/local-embedding-model-state.service';

type BookVectorProviderId = 'local' | VectorConfigurationProviderId;
type BookVectorOperation = 'select' | 'enable' | 'disable' | 'automatic' | 'clear';
type ReindexProgress = { processedParagraphs: number; totalParagraphs: number };

interface BookVectorProviderOption {
  id: BookVectorProviderId;
  name: string;
  description: string;
}

const EMPTY_API_KEY_STATUSES: Record<VectorConfigurationProviderId, VectorApiKeyStatus> = {
  openai: { configured: false, suffix: null },
  voyage: { configured: false, suffix: null },
  openrouter: { configured: false, suffix: null },
};

@Component({
  selector: 'app-book-vector-settings',
  templateUrl: './book-vector-settings.component.html',
  styleUrl: './book-vector-settings.component.scss',
})
export class BookVectorSettingsComponent implements OnInit, OnDestroy {
  readonly book = input.required<BookDto>();
  readonly bookChange = output<BookDto>();
  readonly vectorConfigurationRequested = output<void>();

  private readonly electronService = inject(ElectronService);
  private readonly libraryService = inject(LibraryService);
  private readonly localModelState = inject(LocalEmbeddingModelStateService);
  private readonly confirmService = inject(ConfirmModalService);
  private readonly removeProgressListeners: Array<() => void> = [];

  readonly providers: readonly BookVectorProviderOption[] = [
    { id: 'local', name: 'Local', description: 'Process embeddings on this device.' },
    { id: 'openai', name: 'OpenAI', description: 'Use text-embedding-3-large.' },
    { id: 'voyage', name: 'Voyage AI', description: 'Use voyage-3.' },
    { id: 'openrouter', name: 'OpenRouter', description: 'Choose a curated cloud model.' },
  ];

  readonly viewedProviderId = signal<BookVectorProviderId>('local');
  readonly selectedLocalModelName = signal<LocalEmbeddingModelName | null>(null);
  readonly selectedOpenRouterModelName = signal<OpenRouterEmbeddingModelName | null>(null);
  readonly openRouterModels = signal<readonly OpenRouterEmbeddingModelDescriptor[]>([]);
  readonly apiKeyStatuses = signal<Record<VectorConfigurationProviderId, VectorApiKeyStatus>>({
    ...EMPTY_API_KEY_STATUSES,
  });
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly operation = signal<BookVectorOperation | null>(null);
  readonly operationTarget = signal<string | null>(null);
  readonly operationError = signal<string | null>(null);
  readonly reindexProgress = signal<ReindexProgress | null>(null);
  readonly indexSizes = signal<readonly BookVectorIndexSize[]>([]);
  readonly localModelStatuses = this.localModelState.statuses;

  readonly selectedProviderId = computed(() => this.providerIdFromBook(this.book()));

  readonly visibleLocalModels = computed(() => {
    const selectedModelName = this.selectedLocalModelName();
    return this.localModelStatuses().filter(
      status => status.installed
        || status.modelName === selectedModelName
        || this.hasIndex('local', status.modelName),
    );
  });

  readonly selectedLocalModelStatus = computed(() => {
    const selectedModelName = this.selectedLocalModelName();
    return this.localModelStatuses().find(status => status.modelName === selectedModelName) ?? null;
  });

  readonly selectedProviderUnavailable = computed(() => {
    const providerId = this.selectedProviderId();
    if (providerId === null) return true;
    if (providerId === 'local') {
      const status = this.selectedLocalModelStatus();
      return status === null || !status.installed;
    }
    if (!this.isProviderConfigured(providerId)) return true;
    return providerId === 'openrouter' && this.selectedOpenRouterModelName() === null;
  });

  readonly unavailableMessage = computed(() => {
    const providerId = this.selectedProviderId();
    if (providerId === null) {
      return 'No embedding model is available.';
    }
    if (providerId === 'local') {
      const status = this.selectedLocalModelStatus();
      return status
        ? `${status.displayName} is not installed. Install it from General Settings → Vector Search, or select another installed model.`
        : null;
    }
    if (!this.isProviderConfigured(providerId)) {
      const provider = this.providers.find(candidate => candidate.id === providerId);
      return `${provider?.name ?? providerId} does not have a vector API key. Configure it in General Settings → Vector Search.`;
    }
    if (providerId === 'openrouter' && !this.selectedOpenRouterModelName()) {
      return 'Choose an OpenRouter embedding model before enabling book indexing.';
    }
    return null;
  });

  readonly savedIndexingEnabled = computed(() => this.book().settings?.vectorSearchEnabled ?? true);
  readonly effectiveIndexingEnabled = computed(
    () => this.savedIndexingEnabled() && !this.selectedProviderUnavailable(),
  );
  readonly automaticIndexingEnabled = computed(
    () => this.book().settings?.automaticIndexingEnabled ?? false,
  );
  readonly reindexPercentage = computed(() => {
    const progress = this.reindexProgress();
    if (!progress || progress.totalParagraphs === 0) return 0;
    return Math.round((progress.processedParagraphs / progress.totalParagraphs) * 100);
  });

  ngOnInit(): void {
    this.viewedProviderId.set(this.selectedProviderId() ?? 'local');
    this.listenForProgress<BookEmbeddingReindexProgress>(
      'vectors:local-model:reindex-progress',
      progress => progress.modelName,
    );
    this.listenForProgress<BookCloudEmbeddingReindexProgress>(
      'vectors:cloud-provider:reindex-progress',
      progress => progress.providerId,
    );
    this.listenForProgress<BookOpenRouterEmbeddingReindexProgress>(
      'vectors:openrouter:reindex-progress',
      progress => progress.modelName,
    );
    void this.load();
  }

  ngOnDestroy(): void {
    this.removeProgressListeners.forEach(remove => remove());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [, localSelection, configuration, openRouterModels, openRouterSelection, indexSizes] =
        await Promise.all([
          this.localModelState.reloadStatuses(),
          this.electronService.invoke('vectors:local-model:get-book-selection', {
            bookId: this.book().id,
          }) as Promise<BookLocalEmbeddingModelSelection>,
          this.electronService.invoke('vectors:config:load') as Promise<VectorProviderConfiguration>,
          this.electronService.invoke('vectors:openrouter:get-models') as Promise<
            readonly OpenRouterEmbeddingModelDescriptor[]
          >,
          this.electronService.invoke('vectors:openrouter:get-book-selection', {
            bookId: this.book().id,
          }) as Promise<BookOpenRouterEmbeddingModelSelection>,
          this.electronService.invoke('vectors:getBookIndexSizes', {
            bookId: this.book().id,
          }) as Promise<readonly BookVectorIndexSize[] | undefined>,
        ]);
      this.selectedLocalModelName.set(localSelection.modelName);
      this.apiKeyStatuses.set(configuration.apiKeys);
      this.openRouterModels.set(openRouterModels);
      this.selectedOpenRouterModelName.set(openRouterSelection.modelName);
      this.indexSizes.set(Array.isArray(indexSizes) ? indexSizes : []);
      this.viewedProviderId.set(this.selectedProviderId() ?? 'local');
    } catch (error) {
      this.loadError.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async selectProvider(providerId: BookVectorProviderId): Promise<void> {
    if (this.operation()) return;
    this.viewedProviderId.set(providerId);
    if (providerId === 'local' || providerId === 'openrouter') {
      return;
    }
    if (!this.isProviderConfigured(providerId)) return;
    if (providerId === this.selectedProviderId()) {
      return;
    }

    this.beginOperation('select', providerId);
    try {
      await this.selectCloudProviderForBook(providerId, this.savedIndexingEnabled());
      if (this.savedIndexingEnabled()) await this.reloadIndexSizes();
      this.emitSettingsUpdate({ embeddingModel: providerId === 'openai' ? 'openAI' : 'voyage' });
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
      this.viewedProviderId.set(this.selectedProviderId() ?? 'local');
    } finally {
      this.finishOperation();
    }
  }

  async selectLocalModel(status: LocalEmbeddingModelStatus): Promise<void> {
    if (!status.installed || this.operation() || this.isLocalModelSelected(status)) return;
    this.beginOperation('select', status.modelName);
    try {
      await this.selectLocalModelForBook(status.modelName, this.savedIndexingEnabled());
      if (this.savedIndexingEnabled()) await this.reloadIndexSizes();
      this.selectedLocalModelName.set(status.modelName);
      this.emitSettingsUpdate({
        embeddingModel: 'local',
        localEmbeddingModel: status.modelName,
      });
      await this.localModelState.reloadStatuses().catch(() => undefined);
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  async selectOpenRouterModel(model: OpenRouterEmbeddingModelDescriptor): Promise<void> {
    if (
      this.operation()
      || !this.isProviderConfigured('openrouter')
      || (
        model.modelName === this.selectedOpenRouterModelName()
        && this.selectedProviderId() === 'openrouter'
      )
    ) return;

    this.beginOperation('select', model.modelName);
    try {
      await this.selectOpenRouterModelForBook(model.modelName, this.savedIndexingEnabled());
      if (this.savedIndexingEnabled()) await this.reloadIndexSizes();
      this.selectedOpenRouterModelName.set(model.modelName);
      this.emitSettingsUpdate({
        embeddingModel: 'openRouter',
        openRouterEmbeddingModel: model.modelName,
      });
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  async toggleIndexing(): Promise<void> {
    if (this.operation() || this.selectedProviderUnavailable()) return;
    const target = this.currentSelectionTarget();
    if (!target) return;

    if (this.savedIndexingEnabled()) {
      this.beginOperation('disable', target);
      try {
        await this.saveSettingsUpdate({ vectorSearchEnabled: false });
      } catch {
        // The persisted preference is unchanged and the error is rendered in the section.
      } finally {
        this.finishOperation();
      }
      return;
    }

    this.beginOperation('enable', target);
    try {
      await this.reconcileCurrentSelection();
      await this.reloadIndexSizes();
      await this.saveSettingsUpdate({ vectorSearchEnabled: true });
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  async toggleAutomaticIndexing(): Promise<void> {
    if (this.operation() || !this.effectiveIndexingEnabled()) return;
    const target = this.currentSelectionTarget();
    if (!target) return;
    this.beginOperation('automatic', target);
    try {
      await this.saveSettingsUpdate({
        automaticIndexingEnabled: !this.automaticIndexingEnabled(),
      });
    } catch {
      // The persisted preference is unchanged and the error is rendered in the section.
    } finally {
      this.finishOperation();
    }
  }

  openVectorConfiguration(event: MouseEvent): void {
    event.preventDefault();
    this.vectorConfigurationRequested.emit();
  }

  isProviderConfigured(providerId: BookVectorProviderId): boolean {
    return providerId === 'local' || this.apiKeyStatuses()[providerId].configured;
  }

  isProviderSelected(providerId: BookVectorProviderId): boolean {
    return this.selectedProviderId() === providerId;
  }

  isLocalModelSelected(status: LocalEmbeddingModelStatus): boolean {
    return this.selectedProviderId() === 'local'
      && status.modelName === this.selectedLocalModelName();
  }

  isOpenRouterModelSelected(model: OpenRouterEmbeddingModelDescriptor): boolean {
    return this.selectedProviderId() === 'openrouter'
      && model.modelName === this.selectedOpenRouterModelName();
  }

  formatIndexSize(provider: BookVectorIndexSize['provider'], model: string): string {
    const bytes = this.indexSize(provider, model)?.estimatedBytes ?? 0;
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'] as const;
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** unitIndex);
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
  }

  hasIndex(provider: BookVectorIndexSize['provider'], model: string): boolean {
    return (this.indexSize(provider, model)?.paragraphCount ?? 0) > 0;
  }

  requestClearIndex(
    provider: BookVectorIndexSize['provider'],
    model: string,
    displayName: string,
  ): void {
    if (this.operation() || !this.hasIndex(provider, model)) return;

    const selected = this.isSelectedIndex(provider, model);
    const disableMessage = selected && this.savedIndexingEnabled()
      ? ' Vector search for this book will also be disabled.'
      : '';
    this.confirmService.open(
      `Clear ${displayName} index?`,
      `This permanently deletes all ${displayName} paragraph embeddings for this book.`
        + `${disableMessage} This procedure is irreversible. Using this model again will require indexing all paragraphs.`,
      () => {
        void this.clearIndex(provider, model, selected);
      },
      undefined,
      { confirmLabel: 'Clear index' },
    );
  }

  private async clearIndex(
    provider: BookVectorIndexSize['provider'],
    model: string,
    selected: boolean,
  ): Promise<void> {
    if (this.operation() || !this.hasIndex(provider, model)) return;

    this.beginOperation('clear', model);
    try {
      if (selected && this.savedIndexingEnabled()) {
        await this.saveSettingsUpdate({ vectorSearchEnabled: false });
      }
      const payload: ClearBookVectorIndexPayload = {
        bookId: this.book().id,
        provider,
        model,
      };
      await this.electronService.invoke('vectors:clearBookIndex', payload);
      await this.reloadIndexSizes();
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  private indexSize(
    provider: BookVectorIndexSize['provider'],
    model: string,
  ): BookVectorIndexSize | undefined {
    return this.indexSizes().find(
      size => size.provider === provider && size.model === model,
    );
  }

  private isSelectedIndex(provider: BookVectorIndexSize['provider'], model: string): boolean {
    const selectedProvider = this.selectedProviderId();
    if (provider === 'local') {
      return selectedProvider === 'local' && model === this.selectedLocalModelName();
    }
    if (provider === 'openRouter') {
      return selectedProvider === 'openrouter' && model === this.selectedOpenRouterModelName();
    }
    return provider === 'openAI'
      ? selectedProvider === 'openai'
      : selectedProvider === 'voyage';
  }

  private async reconcileCurrentSelection(): Promise<void> {
    const providerId = this.selectedProviderId();
    if (providerId === null) return;
    if (providerId === 'local') {
      const modelName = this.selectedLocalModelName();
      if (modelName) await this.selectLocalModelForBook(modelName, true);
      return;
    }
    if (providerId === 'openrouter') {
      const modelName = this.selectedOpenRouterModelName();
      if (modelName) await this.selectOpenRouterModelForBook(modelName, true);
      return;
    }
    await this.selectCloudProviderForBook(providerId, true);
  }

  private async reloadIndexSizes(): Promise<void> {
    const sizes = await this.electronService.invoke('vectors:getBookIndexSizes', {
      bookId: this.book().id,
    }) as readonly BookVectorIndexSize[];
    this.indexSizes.set(Array.isArray(sizes) ? sizes : []);
  }

  private selectLocalModelForBook(modelName: LocalEmbeddingModelName, reindex: boolean): Promise<unknown> {
    const payload: SelectBookLocalEmbeddingModelPayload = {
      bookId: this.book().id,
      modelName,
      reindex,
    };
    return this.electronService.invoke('vectors:local-model:select-for-book', payload);
  }

  private selectCloudProviderForBook(providerId: VectorCloudProviderId, reindex: boolean): Promise<unknown> {
    const payload: SelectBookCloudEmbeddingProviderPayload = {
      bookId: this.book().id,
      providerId,
      reindex,
    };
    return this.electronService.invoke('vectors:cloud-provider:select-for-book', payload);
  }

  private selectOpenRouterModelForBook(
    modelName: OpenRouterEmbeddingModelName,
    reindex: boolean,
  ): Promise<unknown> {
    const payload: SelectBookOpenRouterEmbeddingModelPayload = {
      bookId: this.book().id,
      modelName,
      reindex,
    };
    return this.electronService.invoke('vectors:openrouter:select-for-book', payload);
  }

  private async saveSettingsUpdate(update: Partial<BookSettingsDto>): Promise<void> {
    this.operationError.set(null);
    try {
      const book = this.book();
      const updatedBook = await this.libraryService.updateBook(book.id, {
        settings: this.mergeSettings(book, update),
      });
      this.bookChange.emit(updatedBook);
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
      throw error;
    }
  }

  private emitSettingsUpdate(update: Partial<BookSettingsDto>): void {
    const book = this.book();
    this.bookChange.emit({
      ...book,
      settings: this.mergeSettings(book, update),
    });
  }

  private mergeSettings(book: BookDto, update: Partial<BookSettingsDto>): BookSettingsDto {
    return {
      language: book.settings?.language ?? book.language,
      proseTense: book.settings?.proseTense ?? 'past',
      pointOfView: book.settings?.pointOfView ?? 'third_limited',
      synopsisAiContext: book.settings?.synopsisAiContext ?? Boolean(book.synopsis?.trim()),
      ...book.settings,
      ...update,
    };
  }

  private providerIdFromBook(book: BookDto): BookVectorProviderId | null {
    switch (book.settings?.embeddingModel) {
      case 'openAI': return 'openai';
      case 'voyage': return 'voyage';
      case 'openRouter': return 'openrouter';
      case 'local': return 'local';
      default: return null;
    }
  }

  private currentSelectionTarget(): string | null {
    const providerId = this.selectedProviderId();
    if (providerId === 'local') return this.selectedLocalModelName();
    if (providerId === 'openrouter') return this.selectedOpenRouterModelName();
    return providerId;
  }

  private listenForProgress<T extends ReindexProgress & { bookId: string }>(
    channel: string,
    target: (progress: T) => string,
  ): void {
    this.removeProgressListeners.push(this.electronService.on(channel, (progress: T) => {
      if (
        this.operation()
        && progress.bookId === this.book().id
        && target(progress) === this.operationTarget()
      ) {
        this.reindexProgress.set(progress);
      }
    }));
  }

  private beginOperation(operation: BookVectorOperation, target: string): void {
    this.operation.set(operation);
    this.operationTarget.set(target);
    this.operationError.set(null);
    this.reindexProgress.set(null);
  }

  private finishOperation(): void {
    this.operation.set(null);
    this.operationTarget.set(null);
    this.reindexProgress.set(null);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
