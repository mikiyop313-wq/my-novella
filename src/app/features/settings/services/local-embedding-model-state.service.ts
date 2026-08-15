import { Injectable, OnDestroy, inject, signal } from '@angular/core';

import type {
  DownloadLocalEmbeddingModelPayload,
  LocalEmbeddingModelDownloadProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  LocalEmbeddingModelTier,
  UninstallLocalEmbeddingModelPayload,
} from '../../../../../shared/models/vector.model';
import { ElectronService } from '../../../core/services/electron.service';

export type LocalModelOperationType = 'download' | 'uninstall';

export interface LocalModelOperation {
  type: LocalModelOperationType;
  modelName: LocalEmbeddingModelName;
}

@Injectable({ providedIn: 'root' })
export class LocalEmbeddingModelStateService implements OnDestroy {
  private readonly electronService = inject(ElectronService);
  private readonly removeDownloadProgressListener: () => void;
  private statusLoadPromise: Promise<void> | null = null;

  readonly statuses = signal<LocalEmbeddingModelStatus[]>([]);
  readonly selectedTier = signal<LocalEmbeddingModelTier>('large');
  readonly statusLoading = signal(true);
  readonly operation = signal<LocalModelOperation | null>(null);
  readonly progress = signal<LocalEmbeddingModelDownloadProgress | null>(null);
  readonly errors = signal<Partial<Record<LocalEmbeddingModelName, string>>>({});
  readonly loadError = signal<string | null>(null);

  private readonly closeHandler = async (): Promise<void> => {
    await this.cancelActiveDownload();
  };

  private readonly unloadHandler = (): void => {
    if (this.operation()?.type === 'download') {
      void this.electronService
        .invoke('vectors:local-model:cancel-download')
        .catch(() => undefined);
    }
  };

  constructor() {
    this.removeDownloadProgressListener = this.electronService.on(
      'vectors:local-model:download-progress',
      (progress: LocalEmbeddingModelDownloadProgress) => {
        const operation = this.operation();
        if (operation?.type === 'download' && operation.modelName === progress.modelName) {
          this.progress.set(progress);
        }
      },
    );
    this.electronService.onBeforeClose(this.closeHandler);
    window.addEventListener('beforeunload', this.unloadHandler);
  }

  ngOnDestroy(): void {
    this.removeDownloadProgressListener();
    this.electronService.removeBeforeCloseHandler(this.closeHandler);
    window.removeEventListener('beforeunload', this.unloadHandler);
  }

  async ensureStatuses(): Promise<void> {
    if (this.statuses().length > 0) return;
    await this.loadStatuses();
  }

  async reloadStatuses(): Promise<void> {
    await this.loadStatuses();
  }

  async download(modelName: LocalEmbeddingModelName): Promise<void> {
    if (this.operation()) return;

    this.operation.set({ type: 'download', modelName });
    this.progress.set(null);
    this.setModelError(modelName, null);
    try {
      const payload: DownloadLocalEmbeddingModelPayload = { modelName };
      const status = await this.electronService.invoke('vectors:local-model:download', payload);
      this.updateModelStatus(status as LocalEmbeddingModelStatus);
    } catch (error) {
      const downloadError = this.errorMessage(error);
      try {
        await this.reloadStatuses();
        this.setModelError(modelName, downloadError);
      } catch (statusError) {
        this.setModelError(
          modelName,
          `${downloadError} Status refresh failed: ${this.errorMessage(statusError)}`,
        );
      }
    } finally {
      this.operation.set(null);
      this.progress.set(null);
    }
  }

  async uninstall(modelName: LocalEmbeddingModelName, clearVectors: boolean): Promise<void> {
    if (this.operation()) return;

    this.operation.set({ type: 'uninstall', modelName });
    this.setModelError(modelName, null);
    try {
      const payload: UninstallLocalEmbeddingModelPayload = { modelName, clearVectors };
      const status = await this.electronService.invoke('vectors:local-model:uninstall', payload);
      this.updateModelStatus(status as LocalEmbeddingModelStatus);
    } catch (error) {
      this.setModelError(modelName, this.errorMessage(error));
    } finally {
      this.operation.set(null);
    }
  }

  selectTier(tier: LocalEmbeddingModelTier): void {
    this.selectedTier.set(tier);
  }

  private async loadStatuses(): Promise<void> {
    if (this.statusLoadPromise) return this.statusLoadPromise;

    this.statusLoading.set(true);
    this.loadError.set(null);
    this.statusLoadPromise = (async () => {
      try {
        const statuses = await this.electronService.invoke('vectors:local-model:get-status');
        this.statuses.set(statuses as LocalEmbeddingModelStatus[]);
      } catch (error) {
        this.statuses.set([]);
        this.loadError.set(this.errorMessage(error));
        throw error;
      } finally {
        this.statusLoading.set(false);
        this.statusLoadPromise = null;
      }
    })();

    await this.statusLoadPromise;
  }

  private async cancelActiveDownload(): Promise<void> {
    if (this.operation()?.type !== 'download') return;
    await this.electronService.invoke('vectors:local-model:cancel-download');
  }

  private updateModelStatus(status: LocalEmbeddingModelStatus): void {
    this.statuses.update((statuses) =>
      statuses.map((current) => (current.modelName === status.modelName ? status : current)),
    );
  }

  private setModelError(modelName: LocalEmbeddingModelName, error: string | null): void {
    this.errors.update((errors) => {
      const updated = { ...errors };
      if (error) updated[modelName] = error;
      else delete updated[modelName];
      return updated;
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
