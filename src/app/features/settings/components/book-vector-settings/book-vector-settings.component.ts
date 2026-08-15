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
  BookEmbeddingReindexProgress,
  BookLocalEmbeddingModelSelection,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  SelectBookLocalEmbeddingModelPayload,
} from '../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { LibraryService } from '../../../library/services/library.service';
import { LocalEmbeddingModelStateService } from '../../services/local-embedding-model-state.service';

type BookVectorOperation = 'select' | 'enable' | 'disable';

@Component({
  selector: 'app-book-vector-settings',
  templateUrl: './book-vector-settings.component.html',
  styleUrl: './book-vector-settings.component.scss',
})
export class BookVectorSettingsComponent implements OnInit, OnDestroy {
  readonly book = input.required<BookDto>();
  readonly bookChange = output<BookDto>();

  private readonly electronService = inject(ElectronService);
  private readonly libraryService = inject(LibraryService);
  private readonly localModelState = inject(LocalEmbeddingModelStateService);
  private removeProgressListener: () => void = () => undefined;

  readonly selectedModelName = signal<LocalEmbeddingModelName | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly operation = signal<BookVectorOperation | null>(null);
  readonly operationModelName = signal<LocalEmbeddingModelName | null>(null);
  readonly operationError = signal<string | null>(null);
  readonly reindexProgress = signal<BookEmbeddingReindexProgress | null>(null);
  readonly localModelStatuses = this.localModelState.statuses;

  readonly visibleModels = computed(() => {
    const selectedModelName = this.selectedModelName();
    return this.localModelStatuses().filter(
      (status) => status.installed || status.modelName === selectedModelName,
    );
  });

  readonly selectedModelStatus = computed(() => {
    const selectedModelName = this.selectedModelName();
    return this.localModelStatuses().find(
      (status) => status.modelName === selectedModelName,
    ) ?? null;
  });

  readonly selectedModelUnavailable = computed(() => {
    const status = this.selectedModelStatus();
    return status !== null && !status.installed;
  });

  readonly savedIndexingEnabled = computed(
    () => this.book().settings?.vectorSearchEnabled ?? true,
  );

  readonly effectiveIndexingEnabled = computed(
    () => this.savedIndexingEnabled() && !this.selectedModelUnavailable(),
  );

  readonly reindexPercentage = computed(() => {
    const progress = this.reindexProgress();
    if (!progress || progress.totalParagraphs === 0) return 0;
    return Math.round((progress.processedParagraphs / progress.totalParagraphs) * 100);
  });

  ngOnInit(): void {
    this.removeProgressListener = this.electronService.on(
      'vectors:local-model:reindex-progress',
      (progress: BookEmbeddingReindexProgress) => {
        if (
          this.operation()
          && progress.bookId === this.book().id
          && progress.modelName === this.operationModelName()
        ) {
          this.reindexProgress.set(progress);
        }
      },
    );
    void this.load();
  }

  ngOnDestroy(): void {
    this.removeProgressListener();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [, selection] = await Promise.all([
        this.localModelState.reloadStatuses(),
        this.electronService.invoke('vectors:local-model:get-book-selection', {
          bookId: this.book().id,
        }) as Promise<BookLocalEmbeddingModelSelection>,
      ]);
      this.selectedModelName.set(selection.modelName);
    } catch (error) {
      this.loadError.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async selectModel(status: LocalEmbeddingModelStatus): Promise<void> {
    if (
      !status.installed
      || this.operation()
      || status.modelName === this.selectedModelName()
    ) return;

    this.beginOperation('select', status.modelName);
    try {
      await this.selectForBook(status.modelName, this.savedIndexingEnabled());
      this.selectedModelName.set(status.modelName);
      this.emitSelectedModel(status.modelName);
      await this.localModelState.reloadStatuses().catch(() => undefined);
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  async toggleIndexing(): Promise<void> {
    if (this.operation() || this.selectedModelUnavailable()) return;

    const modelName = this.selectedModelName();
    if (!modelName) return;

    if (this.savedIndexingEnabled()) {
      this.beginOperation('disable', modelName);
      try {
        await this.saveIndexingPreference(false);
      } catch {
        // The persisted preference is unchanged and the error is rendered in the section.
      } finally {
        this.finishOperation();
      }
      return;
    }

    this.beginOperation('enable', modelName);
    try {
      await this.selectForBook(modelName, true);
      await this.saveIndexingPreference(true);
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
    } finally {
      this.finishOperation();
    }
  }

  isSelected(status: LocalEmbeddingModelStatus): boolean {
    return status.modelName === this.selectedModelName();
  }

  private async selectForBook(
    modelName: LocalEmbeddingModelName,
    reindex: boolean,
  ): Promise<void> {
    const payload: SelectBookLocalEmbeddingModelPayload = {
      bookId: this.book().id,
      modelName,
      reindex,
    };
    await this.electronService.invoke('vectors:local-model:select-for-book', payload);
  }

  private async saveIndexingPreference(vectorSearchEnabled: boolean): Promise<void> {
    this.operationError.set(null);
    try {
      const book = this.book();
      const updatedBook = await this.libraryService.updateBook(book.id, {
        settings: this.mergeSettings(book, { vectorSearchEnabled }),
      });
      this.bookChange.emit(updatedBook);
    } catch (error) {
      this.operationError.set(this.errorMessage(error));
      throw error;
    }
  }

  private emitSelectedModel(modelName: LocalEmbeddingModelName): void {
    const book = this.book();
    this.bookChange.emit({
      ...book,
      settings: this.mergeSettings(book, {
        embeddingModel: 'local',
        localEmbeddingModel: modelName,
      }),
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

  private beginOperation(operation: BookVectorOperation, modelName: LocalEmbeddingModelName): void {
    this.operation.set(operation);
    this.operationModelName.set(modelName);
    this.operationError.set(null);
    this.reindexProgress.set(null);
  }

  private finishOperation(): void {
    this.operation.set(null);
    this.operationModelName.set(null);
    this.reindexProgress.set(null);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
