import { Component, computed, signal } from '@angular/core';

type CloudProviderId = 'openrouter' | 'google' | 'openai' | 'anthropic';
type LocalProviderId = 'ollama' | 'lm-studio';
type ProviderId = CloudProviderId | LocalProviderId;

interface CloudProvider {
  id: CloudProviderId;
  name: string;
  description: string;
  mark: string;
  keyPlaceholder: string;
}

interface LocalProvider {
  id: LocalProviderId;
  name: string;
  description: string;
  mark: string;
  urlPlaceholder: string;
}

@Component({
  selector: 'app-ai-configuration-settings',
  templateUrl: './ai-configuration-settings.component.html',
  styleUrl: './ai-configuration-settings.component.scss',
})
export class AiConfigurationSettingsComponent {
  readonly cloudProviders: readonly CloudProvider[] = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Access models from multiple AI providers through one API.',
      mark: 'OR',
      keyPlaceholder: 'sk-or-...',
    },
    {
      id: 'google',
      name: 'Google Gemini',
      description: 'Use Gemini models directly through Google AI.',
      mark: 'G',
      keyPlaceholder: 'Enter your Google AI API key',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Connect directly to OpenAI models.',
      mark: 'OA',
      keyPlaceholder: 'sk-...',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Connect directly to Claude models.',
      mark: 'A',
      keyPlaceholder: 'sk-ant-...',
    },
  ];

  readonly localProviders: readonly LocalProvider[] = [
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Run and use models hosted by Ollama on your computer.',
      mark: 'O',
      urlPlaceholder: 'http://localhost:11434',
    },
    {
      id: 'lm-studio',
      name: 'LM Studio',
      description: 'Connect to the local OpenAI-compatible LM Studio server.',
      mark: 'LM',
      urlPlaceholder: 'http://localhost:1234/v1',
    },
  ];

  readonly selectedProvider = signal<ProviderId | null>(null);
  readonly apiKeyVisible = signal(false);
  readonly apiKeys = signal<Record<CloudProviderId, string>>({
    openrouter: '',
    google: '',
    openai: '',
    anthropic: '',
  });
  readonly serverUrls = signal<Record<LocalProviderId, string>>({
    ollama: '',
    'lm-studio': '',
  });

  readonly selectedCloudProvider = computed(() => {
    const selectedProvider = this.selectedProvider();
    return this.cloudProviders.find((provider) => provider.id === selectedProvider) ?? null;
  });

  readonly selectedLocalProvider = computed(() => {
    const selectedProvider = this.selectedProvider();
    return this.localProviders.find((provider) => provider.id === selectedProvider) ?? null;
  });

  selectProvider(providerId: ProviderId): void {
    this.selectedProvider.set(providerId);
    this.apiKeyVisible.set(false);
  }

  updateApiKey(providerId: CloudProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apiKeys.update((keys) => ({ ...keys, [providerId]: value }));
  }

  updateServerUrl(providerId: LocalProviderId, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.serverUrls.update((urls) => ({ ...urls, [providerId]: value }));
  }

  toggleApiKeyVisibility(): void {
    this.apiKeyVisible.update((visible) => !visible);
  }
}
