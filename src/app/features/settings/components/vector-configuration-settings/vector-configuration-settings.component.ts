import { Component, computed, signal } from '@angular/core';

import { AiProviderIconComponent } from '../ai-configuration-settings/ai-provider-icon.component';

type VectorCloudProviderId = 'openai' | 'voyage';

interface VectorCloudProvider {
  id: VectorCloudProviderId;
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
export class VectorConfigurationSettingsComponent {
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

  readonly selectedProviderId = signal<VectorCloudProviderId | null>(null);
  readonly apiKeyVisible = signal(false);
  readonly apiKeyDrafts = signal<Record<VectorCloudProviderId, string>>({
    openai: '',
    voyage: '',
  });

  readonly selectedProvider = computed(() => {
    const providerId = this.selectedProviderId();
    return this.providers.find((provider) => provider.id === providerId) ?? null;
  });

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
