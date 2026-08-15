import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';

import type {
  DownloadLocalEmbeddingModelPayload,
  LocalEmbeddingModelDownloadProgress,
  LocalEmbeddingModelName,
  LocalEmbeddingModelStatus,
  LocalEmbeddingModelTier,
  UninstallLocalEmbeddingModelPayload,
} from '../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../shared/components/confirm-modal/confirm-modal.service';

import { AiProviderIconComponent } from '../ai-configuration-settings/ai-provider-icon.component';

type VectorCloudProviderId = 'openai' | 'voyage';

interface VectorCloudProvider {
  id: VectorCloudProviderId;
  name: string;
  description: string;
  keyPlaceholder: string;
}

type LocalModelOperationType = 'download' | 'uninstall';

interface LocalModelOperation {
  type: LocalModelOperationType;
  modelName: LocalEmbeddingModelName;
}

@Component({
  selector: 'app-vector-configuration-settings',
  imports: [AiProviderIconComponent],
  templateUrl: './vector-configuration-settings.component.html',
  styleUrl: '../ai-configuration-settings/ai-configuration-settings.component.scss',
})
export class VectorConfigurationSettingsComponent implements OnInit, OnDestroy {
  private readonly electronService = inject(ElectronService);
  private readonly confirmService = inject(ConfirmModalService);
  private removeDownloadProgressListener: () => void = () => {};

  readonly providers: readonly VectorCloudProvider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Create manuscript embeddings with OpenAI models.',
      keyPlaceholder: 'sk-...',
    },
    {
      id: 'voyage',
      name: 'Voyage AI',
      description: 'Create manuscript embeddings with Voyage models.',
      keyPlaceholder: 'Enter your Voyage AI API key',
    },
  ];
  readonly localModelTiers: readonly { id: LocalEmbeddingModelTier; label: string }[] = [
    { id: 'large', label: 'Large' },
    { id: 'medium', label: 'Medium' },
    { id: 'small', label: 'Small' },
  ];

  readonly selectedProviderId = signal<VectorCloudProviderId | null>(null);
  readonly apiKeyVisible = signal(false);
  readonly apiKeyDrafts = signal<Record<VectorCloudProviderId, string>>({
    openai: '',
    voyage: '',
  });
  readonly localModelStatuses = signal<LocalEmbeddingModelStatus[]>([]);
  readonly selectedLocalModelTier = signal<LocalEmbeddingModelTier>('large');
  readonly localModelStatusLoading = signal(true);
  readonly localModelOperation = signal<LocalModelOperation | null>(null);
  readonly localModelProgress = signal<LocalEmbeddingModelDownloadProgress | null>(null);
  readonly localModelErrors = signal<Partial<Record<LocalEmbeddingModelName, string>>>({});
  readonly localModelLoadError = signal<string | null>(null);

  readonly selectedProvider = computed(() => {
    const providerId = this.selectedProviderId();
    return this.providers.find((provider) => provider.id === providerId) ?? null;
  });

  ngOnInit(): void {
    this.removeDownloadProgressListener = this.electronService.on(
      'vectors:local-model:download-progress',
      (progress: LocalEmbeddingModelDownloadProgress) => {
        const operation = this.localModelOperation();
        if (operation?.type === 'download' && operation.modelName === progress.modelName) {
          this.localModelProgress.set(progress);
        }
      },
    );
    void this.loadLocalModelStatus();
  }

  ngOnDestroy(): void {
    this.removeDownloadProgressListener();
  }

  async loadLocalModelStatus(): Promise<void> {
    this.localModelStatusLoading.set(true);
    this.localModelLoadError.set(null);
    try {
      const statuses = await this.electronService.invoke('vectors:local-model:get-status');
      this.localModelStatuses.set(statuses as LocalEmbeddingModelStatus[]);
    } catch (error) {
      this.localModelStatuses.set([]);
      this.localModelLoadError.set(this.errorMessage(error));
    } finally {
      this.localModelStatusLoading.set(false);
    }
  }

  async downloadLocalModel(modelName: LocalEmbeddingModelName): Promise<void> {
    if (this.localModelOperation()) return;

    this.localModelOperation.set({ type: 'download', modelName });
    this.localModelProgress.set(null);
    this.setModelError(modelName, null);
    try {
      const payload: DownloadLocalEmbeddingModelPayload = { modelName };
      const status = await this.electronService.invoke('vectors:local-model:download', payload);
      this.updateModelStatus(status as LocalEmbeddingModelStatus);
    } catch (error) {
      const downloadError = this.errorMessage(error);
      try {
        const statuses = await this.electronService.invoke('vectors:local-model:get-status');
        this.localModelStatuses.set(statuses as LocalEmbeddingModelStatus[]);
        this.setModelError(modelName, downloadError);
      } catch (statusError) {
        this.setModelError(
          modelName,
          `${downloadError} Status refresh failed: ${this.errorMessage(statusError)}`,
        );
      }
    } finally {
      this.localModelOperation.set(null);
      this.localModelProgress.set(null);
    }
  }

  requestLocalModelUninstall(status: LocalEmbeddingModelStatus): void {
    if (this.localModelOperation()) return;

    const action = status.installed ? 'Uninstall' : 'Remove downloaded files for';
    this.confirmService.open(
      `${action} local model?`,
      `${status.modelName} will be removed from this device. You can download it again later.`,
      (clearVectors) => {
        void this.uninstallLocalModel(status.modelName, clearVectors);
      },
      undefined,
      {
        confirmLabel: status.installed ? 'Uninstall' : 'Remove files',
        checkboxLabel: 'Also delete vectors generated by this model.',
      },
    );
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** unitIndex;
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`;
  }

  downloadPercentage(modelName: LocalEmbeddingModelName): number | null {
    const progress = this.localModelProgress();
    if (!progress || progress.modelName !== modelName) return null;
    if (typeof progress.progress === 'number') return this.clampPercentage(progress.progress);
    if (
      typeof progress.loaded === 'number' &&
      typeof progress.total === 'number' &&
      progress.total > 0
    ) {
      return this.clampPercentage((progress.loaded / progress.total) * 100);
    }
    return null;
  }

  modelsForTier(tier: LocalEmbeddingModelTier): LocalEmbeddingModelStatus[] {
    return this.localModelStatuses().filter((status) => status.tier === tier);
  }

  selectLocalModelTier(tier: LocalEmbeddingModelTier): void {
    this.selectedLocalModelTier.set(tier);
  }

  modelError(modelName: LocalEmbeddingModelName): string | null {
    return this.localModelErrors()[modelName] ?? null;
  }

  isModelOperation(modelName: LocalEmbeddingModelName, type?: LocalModelOperationType): boolean {
    const operation = this.localModelOperation();
    return operation?.modelName === modelName && (!type || operation.type === type);
  }

  private async uninstallLocalModel(
    modelName: LocalEmbeddingModelName,
    clearVectors: boolean,
  ): Promise<void> {
    if (this.localModelOperation()) return;

    this.localModelOperation.set({ type: 'uninstall', modelName });
    this.setModelError(modelName, null);
    try {
      const payload: UninstallLocalEmbeddingModelPayload = { modelName, clearVectors };
      const status = await this.electronService.invoke('vectors:local-model:uninstall', payload);
      this.updateModelStatus(status as LocalEmbeddingModelStatus);
    } catch (error) {
      this.setModelError(modelName, this.errorMessage(error));
    } finally {
      this.localModelOperation.set(null);
    }
  }

  private updateModelStatus(status: LocalEmbeddingModelStatus): void {
    this.localModelStatuses.update((statuses) =>
      statuses.map((current) => (current.modelName === status.modelName ? status : current)),
    );
  }

  private setModelError(modelName: LocalEmbeddingModelName, error: string | null): void {
    this.localModelErrors.update((errors) => {
      const updated = { ...errors };
      if (error) updated[modelName] = error;
      else delete updated[modelName];
      return updated;
    });
  }

  private clampPercentage(value: number): number {
    return Math.round(Math.min(100, Math.max(0, value)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  selectProvider(providerId: VectorCloudProviderId): void {
    this.selectedProviderId.set(providerId);
    this.apiKeyVisible.set(false);
  }

  updateApiKey(providerId: VectorCloudProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: value }));
  }

  toggleApiKeyVisibility(): void {
    this.apiKeyVisible.update((visible) => !visible);
  }

  apiKeyInputType(): 'text' | 'password' {
    return this.apiKeyVisible() ? 'text' : 'password';
  }

  /** Persistence will be connected when the vector configuration backend is implemented. */
  saveApiKeyOnBlur(_providerId: VectorCloudProviderId): void {}

  /** Connection testing will be connected when the vector configuration backend is implemented. */
  testConnection(_providerId: VectorCloudProviderId): void {}
}
