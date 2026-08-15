import { Component, OnInit, computed, inject, signal } from '@angular/core';

import type {
  AiApiKeyStatus,
  AiCloudProviderId,
  AiLocalProviderId,
  AiProviderConfiguration,
  SaveAiApiKeyRequest,
  SaveAiServerUrlRequest,
} from '../../../../../../shared/models/ai.model';
import { ElectronService } from '../../../../core/services/electron.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AiProviderIconComponent } from './ai-provider-icon.component';

type ProviderId = AiCloudProviderId | AiLocalProviderId;
type SaveState = 'idle' | 'saving' | 'saved';

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
  private readonly toastService = inject(ToastService);
  private readonly revisions: Record<ProviderId, number> = {
    openrouter: 0,
    google: 0,
    openai: 0,
    anthropic: 0,
    ollama: 0,
    'lm-studio': 0,
  };

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

  readonly selectedProvider = signal<ProviderId | null>(null);
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
  private readonly saveStates = signal<Record<ProviderId, SaveState>>({
    openrouter: 'idle',
    google: 'idle',
    openai: 'idle',
    anthropic: 'idle',
    ollama: 'idle',
    'lm-studio': 'idle',
  });
  readonly fieldErrors = signal<Record<ProviderId, string | null>>({
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

  selectProvider(providerId: ProviderId): void {
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

  fieldStatus(providerId: ProviderId): string {
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

  private async saveApiKey(providerId: AiCloudProviderId): Promise<void> {
    const apiKey = (this.apiKeyDrafts()[providerId] ?? '').trim();
    const revision = this.revisions[providerId];

    this.setSaveState(providerId, 'saving');
    try {
      const request: SaveAiApiKeyRequest = { providerId, apiKey };
      const status = (await this.electronService.invoke(
        'ai:config:save-api-key',
        request,
      )) as AiApiKeyStatus;

      if (this.revisions[providerId] !== revision) return;

      this.apiKeyStatuses.update((statuses) => ({ ...statuses, [providerId]: status }));
      this.apiKeyDrafts.update((drafts) => ({ ...drafts, [providerId]: apiKey }));
      this.apiKeyDirty.update((dirty) => ({ ...dirty, [providerId]: false }));
      this.setFieldError(providerId, null);
      this.setSaveState(providerId, status.configured ? 'saved' : 'idle');
    } catch (error) {
      if (this.revisions[providerId] !== revision) return;

      const message = this.errorMessage(error, 'Unable to save the API key.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'API key save failed');
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

  private async saveServerUrl(providerId: AiLocalProviderId): Promise<void> {
    const serverUrl = this.serverUrls()[providerId].trim();
    const revision = this.revisions[providerId];
    const validationError = this.validateServerUrl(serverUrl);

    if (validationError) {
      this.setFieldError(providerId, validationError);
      return;
    }

    this.setSaveState(providerId, 'saving');
    try {
      const request: SaveAiServerUrlRequest = { providerId, serverUrl };
      const savedUrl = (await this.electronService.invoke(
        'ai:config:save-server-url',
        request,
      )) as string;

      if (this.revisions[providerId] !== revision) return;

      this.serverUrls.update((urls) => ({ ...urls, [providerId]: savedUrl }));
      this.serverUrlDirty.update((dirty) => ({ ...dirty, [providerId]: false }));
      this.setFieldError(providerId, null);
      this.setSaveState(providerId, 'saved');
    } catch (error) {
      if (this.revisions[providerId] !== revision) return;

      const message = this.errorMessage(error, 'Unable to save the server URL.');
      this.setFieldError(providerId, message);
      this.toastService.error(message, 'Server URL save failed');
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

  private isConfigured(providerId: ProviderId): boolean {
    if (providerId === 'ollama' || providerId === 'lm-studio') {
      return Boolean(this.serverUrls()[providerId].trim()) && !this.serverUrlDirty()[providerId];
    }
    return this.apiKeyStatuses()[providerId].configured && !this.apiKeyDirty()[providerId];
  }

  private setSaveState(providerId: ProviderId, state: SaveState): void {
    this.saveStates.update((states) => ({ ...states, [providerId]: state }));
  }

  private setFieldError(providerId: ProviderId, error: string | null): void {
    this.fieldErrors.update((errors) => ({ ...errors, [providerId]: error }));
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
