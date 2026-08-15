import { Component, OnInit, computed, inject, signal } from '@angular/core';

import type {
  AiApiKeyStatus,
  AiCloudProviderId,
  AiLocalProviderId,
  AiProviderId,
  AiProviderConfiguration,
  SaveAiApiKeyRequest,
  SaveAiServerUrlRequest,
  TestAiProviderConnectionRequest,
} from '../../../../../../shared/models/ai.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { AiStore } from '../../../../core/store/ai.store';
import { ToastService } from '../../../../shared/services/toast.service';
import { AiProviderIconComponent } from './ai-provider-icon.component';

type SaveState = 'idle' | 'saving' | 'saved';
type ConnectionResult = {
  status: 'success' | 'error';
  message: string;
};

interface CloudProvider {
  id: AiCloudProviderId;
  name: string;
  description: string;
  keyPlaceholder: string;
}

interface LocalProvider {
  id: AiLocalProviderId;
  name: string;
  description: string;
  urlPlaceholder: string;
}

@Component({
  selector: 'app-ai-configuration-settings',
  imports: [AiProviderIconComponent],
  templateUrl: './ai-configuration-settings.component.html',
  styleUrl: './ai-configuration-settings.component.scss',
})
export class AiConfigurationSettingsComponent implements OnInit {
  private readonly electronService = inject(ElectronService);
  private readonly aiStore = inject(AiStore);
  private readonly toastService = inject(ToastService);
  private readonly revisions: Record<AiProviderId, number> = {
    openrouter: 0,
    google: 0,
    openai: 0,
    anthropic: 0,
    ollama: 0,
    'lm-studio': 0,
  };
  private readonly pendingSaves: Partial<Record<AiProviderId, {
    revision: number;
    promise: Promise<boolean>;
  }>> = {};

  readonly cloudProviders: readonly CloudProvider[] = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Access models from multiple AI providers through one API.',
      keyPlaceholder: 'sk-or-...',
    },
    {
      id: 'google',
      name: 'Google Gemini',
      description: 'Use Gemini models directly through Google AI.',
      keyPlaceholder: 'Enter your Google AI API key',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Connect directly to OpenAI models.',
      keyPlaceholder: 'sk-...',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Connect directly to Claude models.',
      keyPlaceholder: 'sk-ant-...',
    },
  ];

  readonly localProviders: readonly LocalProvider[] = [
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Run and use models hosted by Ollama on your computer.',
      urlPlaceholder: 'http://localhost:11434',
    },
    {
      id: 'lm-studio',
      name: 'LM Studio',
      description: 'Connect to the local OpenAI-compatible LM Studio server.',
      urlPlaceholder: 'http://localhost:1234/v1',
    },
  ];

  readonly selectedProvider = signal<AiProviderId | null>(null);
  readonly testingProvider = signal<AiProviderId | null>(null);
  readonly connectionResults = signal<Record<AiProviderId, ConnectionResult | null>>({
    openrouter: null,
    google: null,
    openai: null,
    anthropic: null,
    ollama: null,
    'lm-studio': null,
  });
  readonly focusedApiKeyProvider = signal<AiCloudProviderId | null>(null);
  readonly apiKeyVisible = signal(false);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  private readonly apiKeyStatuses = signal<Record<AiCloudProviderId, AiApiKeyStatus>>({
    openrouter: { configured: false, suffix: null },
    google: { configured: false, suffix: null },
    openai: { configured: false, suffix: null },
    anthropic: { configured: false, suffix: null },
  });
  private readonly apiKeyDrafts = signal<Record<AiCloudProviderId, string | null>>({
    openrouter: null,
    google: null,
    openai: null,
    anthropic: null,
  });
  private readonly apiKeyDirty = signal<Record<AiCloudProviderId, boolean>>({
    openrouter: false,
    google: false,
    openai: false,
    anthropic: false,
  });
  readonly serverUrls = signal<Record<AiLocalProviderId, string>>({
    ollama: '',
    'lm-studio': '',
  });
  private readonly serverUrlDirty = signal<Record<AiLocalProviderId, boolean>>({
    ollama: false,
    'lm-studio': false,
  });
  private readonly saveStates = signal<Record<AiProviderId, SaveState>>({
    openrouter: 'idle',
    google: 'idle',
    openai: 'idle',
    anthropic: 'idle',
    ollama: 'idle',
    'lm-studio': 'idle',
  });
  readonly fieldErrors = signal<Record<AiProviderId, string | null>>({
    openrouter: null,
    google: null,
    openai: null,
    anthropic: null,
    ollama: null,
    'lm-studio': null,
  });

  readonly selectedCloudProvider = computed(() => {
    const selectedProvider = this.selectedProvider();
    return this.cloudProviders.find((provider) => provider.id === selectedProvider) ?? null;
  });

  readonly selectedLocalProvider = computed(() => {
    const selectedProvider = this.selectedProvider();
    return this.localProviders.find((provider) => provider.id === selectedProvider) ?? null;
  });

  ngOnInit(): void {
    void this.loadConfiguration();
  }

  async loadConfiguration(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);

    try {
      const configuration = (await this.electronService.invoke(
        'ai:config:load',
      )) as AiProviderConfiguration;
      this.apiKeyStatuses.set(configuration.apiKeys);
      this.serverUrls.set({
        ollama: configuration.serverUrls.ollama ?? '',
        'lm-studio': configuration.serverUrls['lm-studio'] ?? '',
      });
    } catch (error) {
      this.loadError.set(this.errorMessage(error, 'Unable to load AI provider configuration.'));
    } finally {
      this.isLoading.set(false);
    }
  }

  selectProvider(providerId: AiProviderId): void {
    this.selectedProvider.set(providerId);
  }

  beginApiKeyEdit(providerId: AiCloudProviderId, event: FocusEvent): void {
    if (this.isLoading()) return;

    const input = event.target as HTMLInputElement;
    const revision = this.revisions[providerId];
    this.focusedApiKeyProvider.set(providerId);
    this.apiKeyVisible.set(false);
    this.setFieldError(providerId, null);
    this.setSaveState(providerId, 'idle');

    if (
      this.apiKeyDrafts()[providerId] === null
      && this.apiKeyStatuses()[providerId].configured
    ) {
      void this.loadApiKeyForEditing(providerId, input, revision);
    }
    queueMicrotask(() => input.select());
  }

  updateApiKey(providerId: AiCloudProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: value }));
    this.apiKeyDirty.update((dirty) => ({ ...dirty, [providerId]: true }));
    this.revisions[providerId] += 1;
    this.setConnectionResult(providerId, null);
    this.setFieldError(providerId, null);
    this.setSaveState(providerId, 'idle');
  }

  saveApiKeyOnBlur(providerId: AiCloudProviderId): void {
    if (this.focusedApiKeyProvider() === providerId) {
      this.focusedApiKeyProvider.set(null);
    }
    this.apiKeyVisible.set(false);

    if (this.apiKeyDirty()[providerId]) {
      void this.saveApiKey(providerId);
    }
  }

  apiKeyInputValue(providerId: AiCloudProviderId): string {
    if (this.focusedApiKeyProvider() === providerId) {
      const draft = this.apiKeyDrafts()[providerId];
      if (draft !== null) return draft;
    }

    const status = this.apiKeyStatuses()[providerId];
    return status.configured ? `••••••••${status.suffix ?? ''}` : '';
  }

  apiKeyInputType(providerId: AiCloudProviderId): 'text' | 'password' {
    if (this.focusedApiKeyProvider() !== providerId) return 'text';
    return this.apiKeyVisible() ? 'text' : 'password';
  }

  updateServerUrl(providerId: AiLocalProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.serverUrls.update((urls) => ({ ...urls, [providerId]: value }));
    this.serverUrlDirty.update((dirty) => ({ ...dirty, [providerId]: true }));
    this.revisions[providerId] += 1;
    this.setConnectionResult(providerId, null);
    this.setFieldError(providerId, null);
    this.setSaveState(providerId, 'idle');
  }

  saveServerUrlOnBlur(providerId: AiLocalProviderId): void {
    if (this.serverUrlDirty()[providerId]) {
      void this.saveServerUrl(providerId);
    }
  }

  toggleApiKeyVisibility(): void {
    this.apiKeyVisible.update((visible) => !visible);
  }

  fieldStatus(providerId: AiProviderId): string {
    const error = this.fieldErrors()[providerId];
    if (error) return error;

    switch (this.saveStates()[providerId]) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Saved';
      case 'idle':
        return this.isConfigured(providerId) ? 'Configured' : '';
    }
  }

  async testConnection(providerId: AiProviderId, providerName: string): Promise<void> {
    if (this.testingProvider() !== null) return;

    this.testingProvider.set(providerId);
    this.setConnectionResult(providerId, null);
    try {
      const saved = this.isLocalProvider(providerId)
        ? !this.serverUrlDirty()[providerId] || await this.saveServerUrl(providerId)
        : !this.apiKeyDirty()[providerId] || await this.saveApiKey(providerId);
      if (!saved) return;

      const request: TestAiProviderConnectionRequest = { providerId };
      await this.electronService.invoke('ai:config:test-connection', request);
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
      if (this.testingProvider() === providerId) {
        this.testingProvider.set(null);
      }
    }
  }

  private saveApiKey(providerId: AiCloudProviderId): Promise<boolean> {
    return this.runSave(providerId, () => this.persistApiKey(providerId));
  }

  private async persistApiKey(providerId: AiCloudProviderId): Promise<boolean> {
    const apiKey = (this.apiKeyDrafts()[providerId] ?? '').trim();
    const revision = this.revisions[providerId];

    this.setSaveState(providerId, 'saving');
    try {
      const request: SaveAiApiKeyRequest = { providerId, apiKey };
      const status = (await this.electronService.invoke(
        'ai:config:save-api-key',
        request,
      )) as AiApiKeyStatus;

      if (this.revisions[providerId] !== revision) return false;

      this.apiKeyStatuses.update((statuses) => ({ ...statuses, [providerId]: status }));
      this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: apiKey }));
      this.apiKeyDirty.update((dirty) => ({ ...dirty, [providerId]: false }));
      this.setFieldError(providerId, null);
      this.setSaveState(providerId, status.configured ? 'saved' : 'idle');
      this.aiStore.invalidateModels();
      return true;
    } catch (error) {
      if (this.revisions[providerId] !== revision) return false;

      const message = this.errorMessage(error, 'Unable to save the API key.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'API key save failed');
      return false;
    }
  }

  private async loadApiKeyForEditing(
    providerId: AiCloudProviderId,
    input: HTMLInputElement,
    revision: number,
  ): Promise<void> {
    try {
      const request = { providerId };
      const apiKey = (await this.electronService.invoke(
        'ai:config:load-api-key',
        request,
      )) as string | null;

      if (this.focusedApiKeyProvider() !== providerId || this.revisions[providerId] !== revision) {
        return;
      }

      if (apiKey === null) {
        this.apiKeyStatuses.update((statuses) => ({
          ...statuses,
          [providerId]: { configured: false, suffix: null },
        }));
        return;
      }

      this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: apiKey }));
      queueMicrotask(() => input.select());
    } catch (error) {
      if (this.focusedApiKeyProvider() !== providerId || this.revisions[providerId] !== revision) {
        return;
      }

      const message = this.errorMessage(error, 'Unable to load the API key.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'API key load failed');
    }
  }

  private saveServerUrl(providerId: AiLocalProviderId): Promise<boolean> {
    return this.runSave(providerId, () => this.persistServerUrl(providerId));
  }

  private async persistServerUrl(providerId: AiLocalProviderId): Promise<boolean> {
    const serverUrl = this.serverUrls()[providerId].trim();
    const revision = this.revisions[providerId];
    const validationError = this.validateServerUrl(serverUrl);

    if (validationError) {
      this.setFieldError(providerId, validationError);
      return false;
    }

    this.setSaveState(providerId, 'saving');
    try {
      const request: SaveAiServerUrlRequest = { providerId, serverUrl };
      const savedUrl = (await this.electronService.invoke(
        'ai:config:save-server-url',
        request,
      )) as string;

      if (this.revisions[providerId] !== revision) return false;

      this.serverUrls.update((urls) => ({ ...urls, [providerId]: savedUrl }));
      this.serverUrlDirty.update((dirty) => ({ ...dirty, [providerId]: false }));
      this.setFieldError(providerId, null);
      this.setSaveState(providerId, 'saved');
      this.aiStore.invalidateModels();
      return true;
    } catch (error) {
      if (this.revisions[providerId] !== revision) return false;

      const message = this.errorMessage(error, 'Unable to save the server URL.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'Server URL save failed');
      return false;
    }
  }

  private validateServerUrl(serverUrl: string): string | null {
    if (!serverUrl) return 'Enter a server URL to save.';

    try {
      const url = new URL(serverUrl);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? null
        : 'Server URL must use HTTP or HTTPS.';
    } catch {
      return 'Enter a valid absolute server URL.';
    }
  }

  private isConfigured(providerId: AiProviderId): boolean {
    if (this.isLocalProvider(providerId)) {
      return Boolean(this.serverUrls()[providerId].trim()) && !this.serverUrlDirty()[providerId];
    }
    return this.apiKeyStatuses()[providerId].configured && !this.apiKeyDirty()[providerId];
  }

  private isLocalProvider(providerId: AiProviderId): providerId is AiLocalProviderId {
    return providerId === 'ollama' || providerId === 'lm-studio';
  }

  private runSave(
    providerId: AiProviderId,
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
      if (this.pendingSaves[providerId]?.promise === save) {
        delete this.pendingSaves[providerId];
      }
    });
    return save;
  }

  private setSaveState(providerId: AiProviderId, state: SaveState): void {
    this.saveStates.update((states) => ({ ...states, [providerId]: state }));
  }

  private setFieldError(providerId: AiProviderId, error: string | null): void {
    this.fieldErrors.update((errors) => ({ ...errors, [providerId]: error }));
  }

  private setConnectionResult(
    providerId: AiProviderId,
    result: ConnectionResult | null,
  ): void {
    this.connectionResults.update((results) => ({ ...results, [providerId]: result }));
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
