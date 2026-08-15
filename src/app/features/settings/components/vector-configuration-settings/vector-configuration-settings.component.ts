import { Component, OnInit, computed, inject, signal } from '@angular/core';

import type {
    LocalEmbeddingModelName,
    LocalEmbeddingModelStatus,
    LocalEmbeddingModelTier,
    LoadVectorApiKeyRequest,
    SaveVectorApiKeyRequest,
    TestVectorProviderConnectionRequest,
    VectorApiKeyStatus,
    VectorConfigurationProviderId,
    VectorProviderConfiguration,
} from '../../../../../../shared/models/vector.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { ConfirmModalService } from '../../../../shared/components/confirm-modal/confirm-modal.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  LocalEmbeddingModelStateService,
  type LocalModelOperationType,
} from '../../services/local-embedding-model-state.service';

import { AiProviderIconComponent } from '../ai-configuration-settings/ai-provider-icon.component';

type SaveState = 'idle' | 'saving' | 'saved';
type ConnectionResult = { status: 'success' | 'error'; message: string };

interface VectorCloudProvider {
  id: VectorConfigurationProviderId;
  name: string;
  description: string;
  keyPlaceholder: string;
}

@Component({
  selector: 'app-vector-configuration-settings',
  imports: [AiProviderIconComponent],
  templateUrl: './vector-configuration-settings.component.html',
  styleUrl: '../ai-configuration-settings/ai-configuration-settings.component.scss',
})
export class VectorConfigurationSettingsComponent implements OnInit {
  private readonly electronService = inject(ElectronService);
  private readonly localModelState = inject(LocalEmbeddingModelStateService);
  private readonly confirmService = inject(ConfirmModalService);
  private readonly toastService = inject(ToastService);
  private readonly revisions: Record<VectorConfigurationProviderId, number> = {
    openai: 0,
    voyage: 0,
    openrouter: 0,
  };
  private readonly pendingSaves: Partial<Record<VectorConfigurationProviderId, {
    revision: number;
    promise: Promise<boolean>;
  }>> = {};

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
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Create manuscript embeddings with curated OpenRouter models.',
      keyPlaceholder: 'sk-or-v1-...',
    },
  ];
  readonly localModelTiers: readonly { id: LocalEmbeddingModelTier; label: string }[] = [
    { id: 'large', label: 'Large' },
    { id: 'medium', label: 'Medium' },
    { id: 'small', label: 'Small' },
  ];

  readonly selectedProviderId = signal<VectorConfigurationProviderId | null>(null);
  readonly focusedApiKeyProvider = signal<VectorConfigurationProviderId | null>(null);
  readonly apiKeyVisible = signal(false);
  readonly apiKeyDrafts = signal<Record<VectorConfigurationProviderId, string | null>>({
    openai: null,
    voyage: null,
    openrouter: null,
  });
  readonly isConfigurationLoading = signal(true);
  readonly configurationLoadError = signal<string | null>(null);
  readonly testingProvider = signal<VectorConfigurationProviderId | null>(null);
  readonly connectionResults = signal<Record<VectorConfigurationProviderId, ConnectionResult | null>>({
    openai: null,
    voyage: null,
    openrouter: null,
  });
  readonly fieldErrors = signal<Record<VectorConfigurationProviderId, string | null>>({
    openai: null,
    voyage: null,
    openrouter: null,
  });
  private readonly apiKeyStatuses = signal<Record<VectorConfigurationProviderId, VectorApiKeyStatus>>({
    openai: { configured: false, suffix: null },
    voyage: { configured: false, suffix: null },
    openrouter: { configured: false, suffix: null },
  });
  private readonly apiKeyDirty = signal<Record<VectorConfigurationProviderId, boolean>>({
    openai: false,
    voyage: false,
    openrouter: false,
  });
  private readonly saveStates = signal<Record<VectorConfigurationProviderId, SaveState>>({
    openai: 'idle',
    voyage: 'idle',
    openrouter: 'idle',
  });
  readonly localModelStatuses = this.localModelState.statuses;
  readonly selectedLocalModelTier = this.localModelState.selectedTier;
  readonly localModelStatusLoading = this.localModelState.statusLoading;
  readonly localModelOperation = this.localModelState.operation;
  readonly localModelProgress = this.localModelState.progress;
  readonly localModelErrors = this.localModelState.errors;
  readonly localModelLoadError = this.localModelState.loadError;

  readonly selectedProvider = computed(() => {
    const providerId = this.selectedProviderId();
    return this.providers.find((provider) => provider.id === providerId) ?? null;
  });

  ngOnInit(): void {
    void this.localModelState.ensureStatuses().catch(() => undefined);
    void this.loadConfiguration();
  }

  async loadConfiguration(): Promise<void> {
    this.isConfigurationLoading.set(true);
    this.configurationLoadError.set(null);
    try {
      const configuration = await this.electronService.invoke(
        'vectors:config:load',
      ) as VectorProviderConfiguration;
      this.apiKeyStatuses.set(configuration.apiKeys);
    } catch (error) {
      this.configurationLoadError.set(
        this.errorMessage(error, 'Unable to load vector provider configuration.'),
      );
    } finally {
      this.isConfigurationLoading.set(false);
    }
  }

  async loadLocalModelStatus(): Promise<void> {
    await this.localModelState.reloadStatuses().catch(() => undefined);
  }

  async downloadLocalModel(modelName: LocalEmbeddingModelName): Promise<void> {
    await this.localModelState.download(modelName);
  }

  requestLocalModelUninstall(status: LocalEmbeddingModelStatus): void {
    if (this.localModelOperation()) return;

    const action = status.installed ? 'Uninstall' : 'Remove downloaded files for';
    const affectedBooks = status.selectedBookCount > 0
      ? ` Indexing will pause for ${status.selectedBookCount} book${status.selectedBookCount === 1 ? '' : 's'} that currently select this model until they install it again or choose another model.`
      : '';
    this.confirmService.open(
      `${action} local model?`,
      `${status.modelName} will be removed from this device. You can download it again later.${affectedBooks}`,
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
    this.localModelState.selectTier(tier);
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
    await this.localModelState.uninstall(modelName, clearVectors);
  }

  private clampPercentage(value: number): number {
    return Math.round(Math.min(100, Math.max(0, value)));
  }

  selectProvider(providerId: VectorConfigurationProviderId): void {
    this.selectedProviderId.set(providerId);
    this.apiKeyVisible.set(false);
  }

  beginApiKeyEdit(providerId: VectorConfigurationProviderId, event: FocusEvent): void {
    if (this.isConfigurationLoading()) return;

    const input = event.target as HTMLInputElement;
    const revision = this.revisions[providerId];
    this.focusedApiKeyProvider.set(providerId);
    this.apiKeyVisible.set(false);
    this.setFieldError(providerId, null);
    this.setSaveState(providerId, 'idle');

    if (this.apiKeyDrafts()[providerId] === null && this.apiKeyStatuses()[providerId].configured) {
      void this.loadApiKeyForEditing(providerId, input, revision);
    }
    queueMicrotask(() => input.select());
  }

  updateApiKey(providerId: VectorConfigurationProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: value }));
    this.apiKeyDirty.update((dirty) => ({ ...dirty, [providerId]: true }));
    this.revisions[providerId] += 1;
    this.setConnectionResult(providerId, null);
    this.setFieldError(providerId, null);
    this.setSaveState(providerId, 'idle');
  }

  toggleApiKeyVisibility(): void {
    this.apiKeyVisible.update((visible) => !visible);
  }

  apiKeyInputValue(providerId: VectorConfigurationProviderId): string {
    if (this.focusedApiKeyProvider() === providerId) {
      const draft = this.apiKeyDrafts()[providerId];
      if (draft !== null) return draft;
    }
    const status = this.apiKeyStatuses()[providerId];
    return status.configured ? `••••••••${status.suffix ?? ''}` : '';
  }

  apiKeyInputType(providerId: VectorConfigurationProviderId): 'text' | 'password' {
    if (this.focusedApiKeyProvider() !== providerId) return 'text';
    return this.apiKeyVisible() ? 'text' : 'password';
  }

  fieldStatus(providerId: VectorConfigurationProviderId): string {
    const error = this.fieldErrors()[providerId];
    if (error) return error;
    switch (this.saveStates()[providerId]) {
      case 'saving': return 'Saving…';
      case 'saved': return 'Saved';
      case 'idle': return this.isConfigured(providerId) ? 'Configured' : '';
    }
  }

  saveApiKeyOnBlur(providerId: VectorConfigurationProviderId): void {
    if (this.focusedApiKeyProvider() === providerId) this.focusedApiKeyProvider.set(null);
    this.apiKeyVisible.set(false);
    if (this.apiKeyDirty()[providerId]) void this.saveApiKey(providerId);
  }

  async testConnection(providerId: VectorConfigurationProviderId, providerName: string): Promise<void> {
    if (this.testingProvider() !== null) return;

    this.testingProvider.set(providerId);
    this.setConnectionResult(providerId, null);
    try {
      const saved = !this.apiKeyDirty()[providerId] || await this.saveApiKey(providerId);
      if (!saved) return;

      const request: TestVectorProviderConnectionRequest = { providerId };
      await this.electronService.invoke('vectors:config:test-connection', request);
      this.setConnectionResult(providerId, {
        status: 'success',
        message: `Connection to ${providerName} succeeded.`,
      });
    } catch (error) {
      this.setConnectionResult(providerId, {
        status: 'error',
        message: this.errorMessage(error, `Unable to connect to ${providerName}.`),
      });
    } finally {
      if (this.testingProvider() === providerId) this.testingProvider.set(null);
    }
  }

  async flushPendingChanges(): Promise<boolean> {
    const saves = this.providers
      .filter((provider) => this.apiKeyDirty()[provider.id])
      .map((provider) => this.saveApiKey(provider.id));
    const results = await Promise.all(saves);

    return results.every((saved) => saved);
  }

  private saveApiKey(providerId: VectorConfigurationProviderId): Promise<boolean> {
    return this.runSave(providerId, () => this.persistApiKey(providerId));
  }

  private async persistApiKey(providerId: VectorConfigurationProviderId): Promise<boolean> {
    const apiKey = (this.apiKeyDrafts()[providerId] ?? '').trim();
    const revision = this.revisions[providerId];
    this.setSaveState(providerId, 'saving');
    try {
      const request: SaveVectorApiKeyRequest = { providerId, apiKey };
      const status = await this.electronService.invoke(
        'vectors:config:save-api-key',
        request,
      ) as VectorApiKeyStatus;
      if (this.revisions[providerId] !== revision) return false;

      this.apiKeyStatuses.update(statuses => ({ ...statuses, [providerId]: status }));
      this.apiKeyDrafts.update(drafts => ({ ...drafts, [providerId]: apiKey }));
      this.apiKeyDirty.update(dirty => ({ ...dirty, [providerId]: false }));
      this.setFieldError(providerId, null);
      this.setSaveState(providerId, status.configured ? 'saved' : 'idle');
      return true;
    } catch (error) {
      if (this.revisions[providerId] !== revision) return false;
      const message = this.errorMessage(error, 'Unable to save the API key.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'Vector API key save failed');
      return false;
    }
  }

  private async loadApiKeyForEditing(
    providerId: VectorConfigurationProviderId,
    input: HTMLInputElement,
    revision: number,
  ): Promise<void> {
    try {
      const request: LoadVectorApiKeyRequest = { providerId };
      const apiKey = await this.electronService.invoke(
        'vectors:config:load-api-key',
        request,
      ) as string | null;
      if (this.focusedApiKeyProvider() !== providerId || this.revisions[providerId] !== revision) {
        return;
      }
      if (apiKey === null) {
        this.apiKeyStatuses.update(statuses => ({
          ...statuses,
          [providerId]: { configured: false, suffix: null },
        }));
        return;
      }
      this.apiKeyDrafts.update(drafts => ({ ...drafts, [providerId]: apiKey }));
      queueMicrotask(() => input.select());
    } catch (error) {
      if (this.focusedApiKeyProvider() !== providerId || this.revisions[providerId] !== revision) {
        return;
      }
      const message = this.errorMessage(error, 'Unable to load the API key.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'Vector API key load failed');
    }
  }

  private runSave(
    providerId: VectorConfigurationProviderId,
    operation: () => Promise<boolean>,
  ): Promise<boolean> {
    const pendingSave = this.pendingSaves[providerId];
    const revision = this.revisions[providerId];
    if (pendingSave) {
      if (pendingSave.revision === revision) return pendingSave.promise;
      return pendingSave.promise.then(() => this.runSave(providerId, operation));
    }
    const save = operation();
    this.pendingSaves[providerId] = { revision, promise: save };
    void save.finally(() => {
      if (this.pendingSaves[providerId]?.promise === save) delete this.pendingSaves[providerId];
    });
    return save;
  }

  private isConfigured(providerId: VectorConfigurationProviderId): boolean {
    return this.apiKeyStatuses()[providerId].configured && !this.apiKeyDirty()[providerId];
  }

  private setSaveState(providerId: VectorConfigurationProviderId, state: SaveState): void {
    this.saveStates.update(states => ({ ...states, [providerId]: state }));
  }

  private setFieldError(providerId: VectorConfigurationProviderId, error: string | null): void {
    this.fieldErrors.update(errors => ({ ...errors, [providerId]: error }));
  }

  private setConnectionResult(
    providerId: VectorConfigurationProviderId,
    result: ConnectionResult | null,
  ): void {
    this.connectionResults.update(results => ({ ...results, [providerId]: result }));
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
