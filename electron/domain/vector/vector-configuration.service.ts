import {
    VECTOR_CLOUD_PROVIDER_IDS,
    type VectorApiKeyStatus,
    type VectorCloudProviderId,
    type VectorProviderConfiguration,
} from '../../../shared/models/vector.model';
import { assertEmbeddingDimensions } from '../../../vectors/embeddings/types';
import { getCloudEmbeddingProvider } from '../../../vectors/embeddings/factory';
import { VectorApiKeyService, vectorApiKeyService } from './vector-api-key.service';

export class VectorConfigurationService {
    constructor(private readonly keys: VectorApiKeyService = vectorApiKeyService) {}

    async loadConfiguration(): Promise<VectorProviderConfiguration> {
        const entries = await Promise.all(
            VECTOR_CLOUD_PROVIDER_IDS.map(async providerId => [
                providerId,
                await this.keys.getApiKeyStatus(providerId),
            ] as const),
        );
        return {
            apiKeys: Object.fromEntries(entries) as Record<VectorCloudProviderId, VectorApiKeyStatus>,
        };
    }

    async saveApiKey(
        providerId: VectorCloudProviderId,
        apiKey: string,
    ): Promise<VectorApiKeyStatus> {
        return this.keys.saveApiKey(providerId, apiKey);
    }

    async loadApiKey(providerId: VectorCloudProviderId): Promise<string | null> {
        return this.keys.getApiKey(providerId);
    }

    async testConnection(providerId: VectorCloudProviderId): Promise<void> {
        const provider = await getCloudEmbeddingProvider(providerId, this.keys);
        const vector = await provider.embedQuery('My Novella vector connection test');
        assertEmbeddingDimensions(provider, [vector]);
    }
}

export const vectorConfigurationService = new VectorConfigurationService();
